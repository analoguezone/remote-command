/**
 * Remote Session Manager
 *
 * Manages SSH connection, tmux control mode, and command execution on remote hosts.
 */

import { Client as SSH2Client, ClientChannel } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { TmuxControlParser, TmuxControlCommands } from './tmux-control.js';
import { CommandQueue } from './command-queue.js';
import {
  SSHOptions,
  ExecOptions,
  CommandResult,
  SystemInfo,
  SessionStatus,
  RemoteCommandError,
  TmuxError
} from '../types.js';
import { logger } from '../utils/logger.js';

export class RemoteSession extends EventEmitter {
  private ssh: SSH2Client | null = null;
  private tmuxStream: ClientChannel | null = null;
  private parser: TmuxControlParser;
  private commandQueue: CommandQueue;
  private connected: boolean = false;
  private currentHost?: string;
  private currentUser?: string;
  private systemInfo?: SystemInfo;
  private connectedAt?: Date;
  private commandsExecuted: number = 0;
  private timeoutCheckInterval?: NodeJS.Timeout;
  private tmuxPaneId: string | null = null;

  constructor() {
    super();
    this.parser = new TmuxControlParser();
    this.commandQueue = new CommandQueue();

    this.setupParsers();
  }

  /**
   * Set up parser event handlers
   */
  private setupParsers(): void {
    // Forward parser events
    this.parser.on('control', (message) => {
      logger.debug('Control message:', message);
    });

    this.parser.on('output', (line) => {
      this.commandQueue.output(line);
    });

    this.parser.on('command-complete', ({ exitCode, output }) => {
      const duration = Date.now() - (this.commandQueue.getCurrent()?.startTime || Date.now());
      this.commandQueue.complete({
        stdout: output,
        stderr: '',
        exitCode: exitCode || 0,
        duration
      });
    });

    this.parser.on('error', (error) => {
      logger.error('Tmux parser error:', error);
      this.commandQueue.fail(error);
    });

    this.parser.on('tmux-exit', (reason) => {
      logger.warn('Tmux exited:', reason);
      this.disconnect();
    });

    // Queue events
    this.commandQueue.on('executing', (command) => {
      this.executeQueuedCommand(command);
    });
  }

  /**
   * Connect to a remote host
   */
  async connect(options: SSHOptions): Promise<void> {
    if (this.connected) {
      throw new RemoteCommandError('Already connected', 'ALREADY_CONNECTED');
    }

    logger.info(`Connecting to ${options.username}@${options.host}:${options.port || 22}`);

    this.ssh = new SSH2Client();
    this.currentHost = options.host;
    this.currentUser = options.username;

    // Prepare SSH options
    const sshConfig: any = {
      host: options.host,
      port: options.port || 22,
      username: options.username,
      readyTimeout: 30000,
      keepaliveInterval: 10000
    };

    // Handle authentication
    if (options.password) {
      // Password-based authentication
      sshConfig.password = options.password;
    } else if (options.privateKey) {
      // Private key provided directly
      sshConfig.privateKey = options.privateKey;
      if (options.passphrase) {
        sshConfig.passphrase = options.passphrase;
      }
    } else if (options.identityFile) {
      // Private key from file
      const keyPath = options.identityFile.replace(/^~/, process.env.HOME || '');
      try {
        sshConfig.privateKey = fs.readFileSync(keyPath);
      } catch (err: any) {
        throw new RemoteCommandError(
          `Failed to read SSH key: ${err.message}`,
          'KEY_READ_FAILED',
          err
        );
      }
    } else {
      // Try default SSH keys
      const defaultKeys = [
        path.join(process.env.HOME || '~', '.ssh', 'id_rsa'),
        path.join(process.env.HOME || '~', '.ssh', 'id_ed25519'),
        path.join(process.env.HOME || '~', '.ssh', 'id_ecdsa')
      ];

      for (const keyPath of defaultKeys) {
        if (fs.existsSync(keyPath)) {
          try {
            sshConfig.privateKey = fs.readFileSync(keyPath);
            logger.info(`Using SSH key: ${keyPath}`);
            break;
          } catch (err) {
            logger.debug(`Failed to read ${keyPath}, trying next...`);
          }
        }
      }

      if (!sshConfig.privateKey) {
        throw new RemoteCommandError(
          'No SSH key found and no password provided. Please specify identity_file or password.',
          'NO_AUTH_METHOD'
        );
      }
    }

    // Connect to SSH
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new RemoteCommandError('SSH connection timeout', 'CONNECTION_TIMEOUT'));
      }, 30000);

      this.ssh!.on('ready', () => {
        clearTimeout(timeout);
        logger.info('SSH connection established');
        resolve();
      });

      this.ssh!.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('SSH connection error:', err);
        reject(new RemoteCommandError(`SSH connection failed: ${err.message}`, 'CONNECTION_FAILED', err));
      });

      this.ssh!.on('close', () => {
        logger.info('SSH connection closed');
        this.handleDisconnect();
      });

      this.ssh!.connect(sshConfig);
    });

    // Bootstrap remote (check tmux, get system info)
    await this.bootstrap();

    // Start tmux control mode
    await this.startTmuxControl();

    this.connected = true;
    this.connectedAt = new Date();

    // Start timeout checker
    this.timeoutCheckInterval = setInterval(() => {
      this.commandQueue.checkTimeout();
    }, 1000);

    this.emit('connected', this.getStatus());
  }

  /**
   * Bootstrap remote host (check tmux, get system info)
   */
  private async bootstrap(): Promise<void> {
    logger.info('Bootstrapping remote host...');

    // Read bootstrap script
    const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '../bootstrap/warpify.sh');
    let bootstrapScript: string;

    try {
      bootstrapScript = fs.readFileSync(scriptPath, 'utf-8');
    } catch {
      // Use inline bootstrap if file doesn't exist
      bootstrapScript = this.getInlineBootstrapScript();
    }

    // Execute bootstrap script
    const result = await this.execRaw(bootstrapScript);

    // Parse system info from output
    try {
      // Look for JSON in output
      const jsonMatch = result.match(/\{[^}]*"os"[^}]*\}/);
      if (jsonMatch) {
        this.systemInfo = JSON.parse(jsonMatch[0]);
        logger.info('System info:', this.systemInfo);
      }
    } catch (err) {
      logger.warn('Failed to parse system info:', err);
    }

    // Check if tmux is available
    if (result.includes('TmuxNotInstalled')) {
      throw new TmuxError(
        'Tmux is not installed on the remote host',
        'TmuxNotInstalled',
        this.systemInfo
      );
    }

    if (result.includes('UnsupportedTmuxVersion')) {
      throw new TmuxError(
        'Tmux version is too old (need >= 2.9)',
        'UnsupportedTmuxVersion',
        this.systemInfo
      );
    }
  }

  /**
   * Get inline bootstrap script
   */
  private getInlineBootstrapScript(): string {
    return `
_find() { command -v "$1" >/dev/null 2>&1; };
_system_details() {
  OS=$(uname);
  PKG="";
  if [ "$OS" = "Darwin" ]; then
    if _find brew; then PKG="homebrew"; fi;
  elif [ "$OS" = "Linux" ]; then
    if _find pacman; then PKG="pacman";
    elif _find zypper; then PKG="zypper";
    elif _find dnf; then PKG="dnf";
    elif _find yum; then PKG="yum";
    elif _find apt; then PKG="apt";
    fi;
  fi;
  RA="no_root_access";
  if command -v sudo >/dev/null && { sudo -vn && sudo -ln; } 2>&1 | grep -E 'may run|a password' > /dev/null; then
    RA="can_run_sudo";
  elif [ "$(id -u)" -eq 0 ]; then
    RA="is_root";
  fi;
  WH=$( [ -w ~ ] && echo true || echo false );
  printf '%s' "{\\"os\\": \\"$OS\\", \\"pkg\\": \\"$PKG\\", \\"shell\\": \\"$(basename $SHELL)\\", \\"root_access\\": \\"$RA\\", \\"writable_home\\": $WH}";
};
if _find tmux; then
  VER=$(tmux -V 2>/dev/null | awk '{print $2}');
  if [ -z "$VER" ]; then
    echo "TmuxFailed";
  elif [ "$(printf '%s\\n' "$VER" "2.9" | sort -V | tail -n1)" != "2.9" ]; then
    echo "UnsupportedTmuxVersion";
    _system_details;
  else
    _system_details;
  fi;
else
  echo "TmuxNotInstalled";
  _system_details;
fi;
`;
  }

  /**
   * Execute raw command via SSH (not through tmux)
   */
  private execRaw(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ssh) {
        reject(new RemoteCommandError('Not connected', 'NOT_CONNECTED'));
        return;
      }

      this.ssh.exec(command, (err, stream) => {
        if (err) {
          reject(new RemoteCommandError(`Exec failed: ${err.message}`, 'EXEC_FAILED', err));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number) => {
          if (code !== 0 && stderr) {
            reject(new RemoteCommandError(`Command failed: ${stderr}`, 'COMMAND_FAILED', { code, stderr }));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  /**
   * Start tmux in control mode
   */
  private async startTmuxControl(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ssh) {
        reject(new RemoteCommandError('Not connected', 'NOT_CONNECTED'));
        return;
      }

      logger.info('Starting tmux control mode...');

      this.ssh.shell((err, stream) => {
        if (err) {
          reject(new RemoteCommandError(`Failed to start shell: ${err.message}`, 'SHELL_FAILED', err));
          return;
        }

        this.tmuxStream = stream;

        // Set up stream handlers
        stream.on('data', (data: Buffer) => {
          this.parser.feed(data);
        });

        stream.on('close', () => {
          logger.info('Tmux stream closed');
          this.handleDisconnect();
        });

        stream.stderr.on('data', (data: Buffer) => {
          logger.warn('Tmux stderr:', data.toString());
        });

        // Start tmux in control mode
        stream.write('tmux -Lremote-cmd -CC\n');

        // Wait for tmux to start, then create a persistent shell window
        setTimeout(() => {
          logger.info('Tmux control mode started, creating shell window...');

          // Create a window with a bash shell and capture the pane ID
          stream.write('new-window -P -F "#{pane_id}" bash\n');

          // Set up a one-time listener to capture the pane ID
          const paneIdListener = (data: Buffer) => {
            const output = data.toString();
            const match = output.match(/%(\d+)/);
            if (match) {
              this.tmuxPaneId = match[0];
              logger.info(`Created tmux pane: ${this.tmuxPaneId}`);
            }
          };

          stream.once('data', paneIdListener);

          setTimeout(() => {
            logger.info('Tmux setup complete');
            resolve();
          }, 500);
        }, 500);
      });
    });
  }

  /**
   * Execute a command on the remote host
   */
  async execute(command: string, options: Partial<ExecOptions> = {}): Promise<CommandResult> {
    if (!this.connected) {
      throw new RemoteCommandError('Not connected', 'NOT_CONNECTED');
    }

    logger.debug(`Executing command: ${command}`);
    this.commandsExecuted++;

    // Build full command with cwd if specified
    let fullCommand = command;
    if (options.cwd) {
      fullCommand = TmuxControlCommands.execInDir(options.cwd, command);
    }

    // Enqueue command
    return this.commandQueue.enqueue(fullCommand, {
      timeout: options.timeout,
      cwd: options.cwd,
      env: options.env
    });
  }

  /**
   * Execute a queued command through tmux
   */
  private executeQueuedCommand(command: any): void {
    if (!this.tmuxStream) {
      this.commandQueue.fail(new RemoteCommandError('Tmux stream not available', 'NO_TMUX_STREAM'));
      return;
    }

    if (!this.tmuxPaneId) {
      this.commandQueue.fail(new RemoteCommandError('Tmux pane not initialized', 'NO_TMUX_PANE'));
      return;
    }

    // Send command to the persistent bash pane
    // Escape the command properly for send-keys
    const escapedCmd = command.command.replace(/"/g, '\\"');
    const tmuxCmd = `send-keys -t ${this.tmuxPaneId} "${escapedCmd}" Enter\n`;
    logger.debug(`Sending to tmux pane ${this.tmuxPaneId}: ${command.command}`);
    this.tmuxStream.write(tmuxCmd);
  }

  /**
   * Disconnect from the remote host
   */
  async disconnect(): Promise<void> {
    if (!this.connected && !this.ssh) {
      return;
    }

    logger.info('Disconnecting...');

    // Clear timeout checker
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = undefined;
    }

    // Cancel all pending commands
    this.commandQueue.cancelAll();

    // Close tmux stream
    if (this.tmuxStream) {
      this.tmuxStream.write('exit\n');
      this.tmuxStream.end();
      this.tmuxStream = null;
    }

    // Close SSH connection
    if (this.ssh) {
      this.ssh.end();
      this.ssh = null;
    }

    this.handleDisconnect();
  }

  /**
   * Handle disconnect event
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.parser.clear();
    this.emit('disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection status
   */
  getStatus(): SessionStatus {
    return {
      connected: this.connected,
      host: this.currentHost,
      remoteHost: this.currentHost,
      user: this.currentUser,
      systemInfo: this.systemInfo,
      connectedAt: this.connectedAt,
      commandsExecuted: this.commandsExecuted
    };
  }
}
