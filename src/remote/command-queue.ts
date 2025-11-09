/**
 * Command Queue Manager
 *
 * Manages queuing and execution of commands on the remote host.
 * Ensures commands execute sequentially while allowing streaming output.
 */

import { EventEmitter } from 'events';
import { QueuedCommand, CommandResult } from '../types.js';
import { logger } from '../utils/logger.js';

export class CommandQueue extends EventEmitter {
  private queue: QueuedCommand[] = [];
  private executing: QueuedCommand | null = null;
  private nextId: number = 1;

  /**
   * Enqueue a command for execution
   */
  enqueue(
    command: string,
    options: {
      timeout?: number;
      cwd?: string;
      env?: Record<string, string>;
      outputCallback?: (data: string) => void;
    } = {}
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const queuedCommand: QueuedCommand = {
        id: `cmd_${this.nextId++}`,
        command,
        timeout: options.timeout || 120000,
        cwd: options.cwd,
        env: options.env,
        outputCallback: options.outputCallback,
        resolve,
        reject
      };

      this.queue.push(queuedCommand);
      logger.debug(`Command queued: ${queuedCommand.id} - ${command}`);

      this.emit('queued', queuedCommand);
      this.processNext();
    });
  }

  /**
   * Process the next command in the queue
   */
  private processNext(): void {
    if (this.executing || this.queue.length === 0) {
      return;
    }

    const command = this.queue.shift()!;
    this.executing = command;
    command.startTime = Date.now();

    logger.debug(`Executing command: ${command.id}`);
    this.emit('executing', command);
  }

  /**
   * Mark current command as complete
   */
  complete(result: CommandResult): void {
    if (!this.executing) {
      logger.warn('complete() called but no command is executing');
      return;
    }

    const command = this.executing;
    logger.debug(`Command completed: ${command.id} (exit code: ${result.exitCode})`);

    if (command.resolve) {
      command.resolve(result);
    }

    this.emit('completed', { command, result });
    this.executing = null;
    this.processNext();
  }

  /**
   * Mark current command as failed
   */
  fail(error: Error): void {
    if (!this.executing) {
      logger.warn('fail() called but no command is executing');
      return;
    }

    const command = this.executing;
    logger.debug(`Command failed: ${command.id} - ${error.message}`);

    if (command.reject) {
      command.reject(error);
    }

    this.emit('failed', { command, error });
    this.executing = null;
    this.processNext();
  }

  /**
   * Handle output from the currently executing command
   */
  output(data: string): void {
    if (!this.executing) {
      return;
    }

    if (this.executing.outputCallback) {
      this.executing.outputCallback(data);
    }

    this.emit('output', { command: this.executing, data });
  }

  /**
   * Get currently executing command
   */
  getCurrent(): QueuedCommand | null {
    return this.executing;
  }

  /**
   * Get queue length
   */
  getLength(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue (does not stop currently executing command)
   */
  clear(): void {
    const cleared = this.queue.splice(0);
    cleared.forEach(cmd => {
      if (cmd.reject) {
        cmd.reject(new Error('Command queue cleared'));
      }
    });
    logger.debug(`Cleared ${cleared.length} queued commands`);
  }

  /**
   * Cancel all commands including currently executing
   */
  cancelAll(): void {
    this.clear();

    if (this.executing && this.executing.reject) {
      this.executing.reject(new Error('Command execution cancelled'));
      this.executing = null;
    }
  }

  /**
   * Check if a timeout has occurred for the current command
   */
  checkTimeout(): boolean {
    if (!this.executing || !this.executing.startTime) {
      return false;
    }

    const elapsed = Date.now() - this.executing.startTime;
    if (elapsed > this.executing.timeout) {
      logger.warn(`Command timeout: ${this.executing.id} (${elapsed}ms > ${this.executing.timeout}ms)`);
      this.fail(new Error(`Command timeout after ${elapsed}ms`));
      return true;
    }

    return false;
  }
}
