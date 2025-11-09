/**
 * Tmux Control Mode Parser
 *
 * Parses output from tmux -CC (control mode) which provides structured,
 * parseable output instead of terminal rendering.
 *
 * Control mode outputs commands like:
 * - %begin <time> <flags> <pane>
 * - %end <time> <flags> <pane> <exit-code>
 * - %output %<pane> <data>
 * - %window-add @<window>
 * - %exit [reason]
 */

import { EventEmitter } from 'events';
import { ControlMessage } from '../types.js';
import { logger } from '../utils/logger.js';

export class TmuxControlParser extends EventEmitter {
  private buffer: string = '';
  private inCommand: boolean = false;
  private currentOutput: string[] = [];

  /**
   * Feed data into the parser
   * @param data Raw data from tmux control mode
   */
  feed(data: string | Buffer): void {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    logger.debug(`TmuxParser: Feeding ${text.length} chars to buffer`);
    this.buffer += text;

    // Process complete lines
    while (this.buffer.includes('\n')) {
      const newlineIndex = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      this.processLine(line);
    }
  }

  /**
   * Process a single line from tmux control mode
   */
  private processLine(line: string): void {
    logger.debug(`TmuxParser: Processing line: ${line}`);

    // Control messages start with %
    if (line.startsWith('%')) {
      logger.debug(`TmuxParser: Control message detected`);
      const message = this.parseControlMessage(line);
      if (message) {
        logger.debug(`TmuxParser: Parsed control message:`, message);
        this.emit('control', message);
        this.handleControlMessage(message);
      } else {
        logger.warn(`TmuxParser: Failed to parse control message: ${line}`);
      }
    } else if (this.inCommand) {
      // Regular output between %begin and %end
      logger.debug(`TmuxParser: Command output line: ${line}`);
      this.currentOutput.push(line);
      this.emit('output', line);
    } else {
      logger.debug(`TmuxParser: Non-control line outside command block (ignored): ${line}`);
    }
  }

  /**
   * Parse a control message line
   */
  private parseControlMessage(line: string): ControlMessage | null {
    // %begin <time> <flags> <pane>
    if (line.startsWith('%begin ')) {
      const parts = line.split(' ');
      if (parts.length >= 4) {
        return {
          type: 'begin',
          timestamp: parseInt(parts[1], 10),
          flags: parseInt(parts[2], 10),
          pane: parseInt(parts[3], 10)
        };
      }
    }

    // %end <time> <flags> <pane> <exit-code>
    if (line.startsWith('%end ')) {
      const parts = line.split(' ');
      if (parts.length >= 5) {
        return {
          type: 'end',
          timestamp: parseInt(parts[1], 10),
          flags: parseInt(parts[2], 10),
          pane: parseInt(parts[3], 10),
          exitCode: parseInt(parts[4], 10)
        };
      }
    }

    // %output %<pane> <data>
    if (line.startsWith('%output ')) {
      const match = line.match(/^%output %(\d+) (.*)$/);
      if (match) {
        // Data might be base64 encoded in some cases
        let data = match[2];
        try {
          // Try to decode if it looks like base64
          if (/^[A-Za-z0-9+/=]+$/.test(data)) {
            data = Buffer.from(data, 'base64').toString('utf-8');
          }
        } catch {
          // Not base64, use as-is
        }
        return {
          type: 'output',
          pane: parseInt(match[1], 10),
          data
        };
      }
    }

    // %window-add @<window>
    if (line.startsWith('%window-add ')) {
      const match = line.match(/^%window-add @(\d+)/);
      if (match) {
        return {
          type: 'window-add',
          window: parseInt(match[1], 10)
        };
      }
    }

    // %window-close @<window>
    if (line.startsWith('%window-close ')) {
      const match = line.match(/^%window-close @(\d+)/);
      if (match) {
        return {
          type: 'window-close',
          window: parseInt(match[1], 10)
        };
      }
    }

    // %layout-change <window> <layout>
    if (line.startsWith('%layout-change ')) {
      const match = line.match(/^%layout-change @(\d+)/);
      if (match) {
        return {
          type: 'layout-change',
          window: parseInt(match[1], 10)
        };
      }
    }

    // %exit [reason]
    if (line.startsWith('%exit')) {
      const reason = line.substring(6).trim();
      return {
        type: 'exit',
        reason: reason || 'unknown'
      };
    }

    // %error <message>
    if (line.startsWith('%error ')) {
      return {
        type: 'error',
        data: line.substring(7)
      };
    }

    return null;
  }

  /**
   * Handle control messages internally
   */
  private handleControlMessage(message: ControlMessage): void {
    logger.debug(`TmuxParser: Handling control message type: ${message.type}`);

    switch (message.type) {
      case 'begin':
        logger.info(`TmuxParser: Command BEGIN on pane ${message.pane}`);
        this.inCommand = true;
        this.currentOutput = [];
        break;

      case 'end':
        logger.info(`TmuxParser: Command END on pane ${message.pane}, exit code ${message.exitCode}, output lines: ${this.currentOutput.length}`);
        this.inCommand = false;
        this.emit('command-complete', {
          pane: message.pane,
          exitCode: message.exitCode,
          output: this.currentOutput.join('\n')
        });
        this.currentOutput = [];
        break;

      case 'exit':
        logger.warn(`TmuxParser: Tmux EXIT with reason: ${message.reason}`);
        this.emit('tmux-exit', message.reason);
        break;

      case 'error':
        logger.error(`TmuxParser: Tmux ERROR: ${message.data}`);
        this.emit('error', new Error(message.data));
        break;
    }
  }

  /**
   * Clear the buffer and reset state
   */
  clear(): void {
    this.buffer = '';
    this.inCommand = false;
    this.currentOutput = [];
  }
}

/**
 * Helper to generate tmux control mode commands
 */
export class TmuxControlCommands {
  /**
   * Create a new window and execute a command
   */
  static newWindow(command: string, paneFormat: string = '#{pane_id}'): string {
    return `new-window -P -F "${paneFormat}" "${command.replace(/"/g, '\\"')}"`;
  }

  /**
   * Send keys to a pane
   */
  static sendKeys(pane: string | number, keys: string): string {
    return `send-keys -t ${pane} "${keys.replace(/"/g, '\\"')}" Enter`;
  }

  /**
   * Kill a pane
   */
  static killPane(pane: string | number): string {
    return `kill-pane -t ${pane}`;
  }

  /**
   * List panes
   */
  static listPanes(format: string = '#{pane_id}:#{pane_current_command}'): string {
    return `list-panes -F "${format}"`;
  }

  /**
   * Get pane output
   */
  static capturePane(pane: string | number, lines: number = -1000): string {
    return `capture-pane -t ${pane} -p -S ${lines}`;
  }

  /**
   * Set environment variable
   */
  static setEnv(name: string, value: string): string {
    return `set-environment ${name} "${value.replace(/"/g, '\\"')}"`;
  }

  /**
   * Create a command to change directory and execute
   */
  static execInDir(cwd: string, command: string): string {
    return `cd "${cwd.replace(/"/g, '\\"')}" && ${command}`;
  }
}
