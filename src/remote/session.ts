/**
 * Remote Session Manager
 *
 * Manages SSH connection and command execution on remote hosts using PTY.
 */

import { Client as SSH2Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  SSHOptions,
  ExecOptions,
  CommandResult,
  SystemInfo,
  SessionStatus,
  RemoteCommandError
} from '../types.js';
import { logger } from '../utils/logger.js';

export class RemoteSession extends EventEmitter {
  private ssh: SSH2Client | null = null;
  private connected: boolean = false;
  private currentHost?: string;
  private currentUser?: string;
  private systemInfo?: SystemInfo;
  private connectedAt?: Date;
  private commandsExecuted: number = 0;

  constructor() {
    super();
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
      sshConfig.password = options.password;
    } else if (options.privateKey) {
      sshConfig.privateKey = options.privateKey;
      if (options.passphrase) {
        sshConfig.passphrase = options.passphrase;
      }
    } else if (options.identityFile) {
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

    // Get system info
    await this.detectSystemInfo();

    this.connected = true;
    this.connectedAt = new Date();

    this.emit('connected', this.getStatus());
  }

  /**
   * Detect system information
   */
  private async detectSystemInfo(): Promise<void> {
    logger.info('Detecting system information...');

    const script = `
OS=$(uname);
PKG="";
if [ "$OS" = "Darwin" ]; then
  if command -v brew >/dev/null 2>&1; then PKG="homebrew"; fi;
elif [ "$OS" = "Linux" ]; then
  if command -v pacman >/dev/null 2>&1; then PKG="pacman";
  elif command -v zypper >/dev/null 2>&1; then PKG="zypper";
  elif command -v dnf >/dev/null 2>&1; then PKG="dnf";
  elif command -v yum >/dev/null 2>&1; then PKG="yum";
  elif command -v apt >/dev/null 2>&1; then PKG="apt";
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
`;

    try {
      const result = await this.execDirect(script);
      const jsonMatch = result.match(/\{[^}]*"os"[^}]*\}/);
      if (jsonMatch) {
        this.systemInfo = JSON.parse(jsonMatch[0]);
        logger.info('System info:', this.systemInfo);
      }
    } catch (err) {
      logger.warn('Failed to detect system info:', err);
    }
  }

  /**
   * Execute command directly via SSH exec
   */
  private execDirect(command: string, options: { pty?: boolean; timeout?: number } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ssh) {
        reject(new RemoteCommandError('Not connected', 'NOT_CONNECTED'));
        return;
      }

      const execOptions: any = {};
      if (options.pty) {
        execOptions.pty = true;
      }

      const timeout = setTimeout(() => {
        reject(new RemoteCommandError(`Command timeout after ${options.timeout || 120000}ms`, 'TIMEOUT'));
      }, options.timeout || 120000);

      this.ssh.exec(command, execOptions, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
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
          clearTimeout(timeout);
          if (code !== 0 && stderr) {
            reject(new RemoteCommandError(`Command failed with code ${code}: ${stderr}`, 'COMMAND_FAILED', { code, stderr }));
          } else {
            resolve(stdout);
          }
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(new RemoteCommandError(`Stream error: ${err.message}`, 'STREAM_ERROR', err));
        });
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

    const startTime = Date.now();

    // Build full command with cwd if specified
    let fullCommand = command;
    if (options.cwd) {
      fullCommand = `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`;
    }

    return new Promise((resolve, reject) => {
      if (!this.ssh) {
        reject(new RemoteCommandError('Not connected', 'NOT_CONNECTED'));
        return;
      }

      // Use PTY for better compatibility
      const execOptions: any = { pty: true };

      const timeout = setTimeout(() => {
        reject(new RemoteCommandError(`Command timeout after ${options.timeout || 120000}ms`, 'TIMEOUT'));
      }, options.timeout || 120000);

      this.ssh.exec(fullCommand, execOptions, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          reject(new RemoteCommandError(`Exec failed: ${err.message}`, 'EXEC_FAILED', err));
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number, signal: string) => {
          clearTimeout(timeout);
          exitCode = code || 0;

          const duration = Date.now() - startTime;
          logger.debug(`Command completed with exit code ${exitCode} in ${duration}ms`);

          resolve({
            stdout,
            stderr,
            exitCode,
            duration
          });
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(new RemoteCommandError(`Stream error: ${err.message}`, 'STREAM_ERROR', err));
        });
      });
    });
  }

  /**
   * Disconnect from the remote host
   */
  async disconnect(): Promise<void> {
    if (!this.connected && !this.ssh) {
      return;
    }

    logger.info('Disconnecting...');

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
