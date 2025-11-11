/**
 * Approval Manager
 *
 * Manages command approval workflow for remote execution.
 * When approval mode is enabled, commands require explicit approval before execution.
 */

import { EventEmitter } from 'events';
import { PendingCommand } from '../types.js';
import { logger } from '../utils/logger.js';

export class ApprovalManager extends EventEmitter {
  private approvalMode: boolean = false;
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private commandCounter: number = 0;

  constructor() {
    super();

    // Check environment variable for default approval mode
    const envApprovalMode = process.env.APPROVAL_MODE?.toLowerCase();
    if (envApprovalMode === 'true' || envApprovalMode === '1' || envApprovalMode === 'on') {
      this.approvalMode = true;
      logger.info('Approval mode enabled by APPROVAL_MODE environment variable');
    }
  }

  /**
   * Enable or disable approval mode
   */
  setApprovalMode(enabled: boolean): void {
    this.approvalMode = enabled;
    logger.info(`Approval mode ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) {
      // Auto-approve all pending commands when disabling
      for (const [id, cmd] of this.pendingCommands.entries()) {
        if (cmd.status === 'pending') {
          this.approve(id);
        }
      }
    }
  }

  /**
   * Check if approval mode is enabled
   */
  isApprovalModeEnabled(): boolean {
    return this.approvalMode;
  }

  /**
   * Add a command to the approval queue
   * Returns command ID if needs approval, null if approval mode is off
   */
  requestApproval(command: string, cwd?: string): string | null {
    if (!this.approvalMode) {
      return null; // No approval needed
    }

    const id = `cmd-${++this.commandCounter}`;
    const pendingCmd: PendingCommand = {
      id,
      command,
      cwd,
      timestamp: new Date(),
      status: 'pending'
    };

    this.pendingCommands.set(id, pendingCmd);
    logger.info(`Command queued for approval: ${id} - ${command}`);
    this.emit('approval-requested', pendingCmd);

    return id;
  }

  /**
   * Approve a pending command
   */
  approve(commandId: string): boolean {
    const cmd = this.pendingCommands.get(commandId);
    if (!cmd) {
      logger.warn(`Cannot approve: command ${commandId} not found`);
      return false;
    }

    if (cmd.status !== 'pending') {
      logger.warn(`Cannot approve: command ${commandId} is ${cmd.status}`);
      return false;
    }

    cmd.status = 'approved';
    logger.info(`Command approved: ${commandId} - ${cmd.command}`);
    this.emit('approved', cmd);
    return true;
  }

  /**
   * Deny a pending command
   */
  deny(commandId: string): boolean {
    const cmd = this.pendingCommands.get(commandId);
    if (!cmd) {
      logger.warn(`Cannot deny: command ${commandId} not found`);
      return false;
    }

    if (cmd.status !== 'pending') {
      logger.warn(`Cannot deny: command ${commandId} is ${cmd.status}`);
      return false;
    }

    cmd.status = 'denied';
    logger.info(`Command denied: ${commandId} - ${cmd.command}`);
    this.emit('denied', cmd);

    // Remove from queue after a short delay
    setTimeout(() => {
      this.pendingCommands.delete(commandId);
    }, 5000);

    return true;
  }

  /**
   * Refine a pending command (replace with new command)
   */
  refine(commandId: string, newCommand: string): boolean {
    const cmd = this.pendingCommands.get(commandId);
    if (!cmd) {
      logger.warn(`Cannot refine: command ${commandId} not found`);
      return false;
    }

    if (cmd.status !== 'pending') {
      logger.warn(`Cannot refine: command ${commandId} is ${cmd.status}`);
      return false;
    }

    logger.info(`Command refined: ${commandId}`);
    logger.info(`  Old: ${cmd.command}`);
    logger.info(`  New: ${newCommand}`);

    // Deny the old command
    cmd.status = 'denied';
    this.emit('denied', cmd);

    // Create a new pending command with the refined version
    const newId = this.requestApproval(newCommand, cmd.cwd);

    // Remove old command from queue
    setTimeout(() => {
      this.pendingCommands.delete(commandId);
    }, 5000);

    this.emit('refined', { oldId: commandId, newId, oldCommand: cmd.command, newCommand });
    return true;
  }

  /**
   * Mark command as executing
   */
  markExecuting(commandId: string): void {
    const cmd = this.pendingCommands.get(commandId);
    if (cmd && cmd.status === 'approved') {
      cmd.status = 'executing';
      logger.debug(`Command executing: ${commandId}`);
    }
  }

  /**
   * Mark command as completed
   */
  markCompleted(commandId: string): void {
    const cmd = this.pendingCommands.get(commandId);
    if (cmd) {
      cmd.status = 'completed';
      logger.debug(`Command completed: ${commandId}`);

      // Clean up completed commands after a delay
      setTimeout(() => {
        this.pendingCommands.delete(commandId);
      }, 10000);
    }
  }

  /**
   * Get all pending commands
   */
  getPendingCommands(): PendingCommand[] {
    return Array.from(this.pendingCommands.values())
      .filter(cmd => cmd.status === 'pending')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get a specific command by ID
   */
  getCommand(commandId: string): PendingCommand | undefined {
    return this.pendingCommands.get(commandId);
  }

  /**
   * Get count of pending approvals
   */
  getPendingCount(): number {
    return Array.from(this.pendingCommands.values())
      .filter(cmd => cmd.status === 'pending').length;
  }

  /**
   * Approve all pending commands
   */
  approveAll(): number {
    let count = 0;
    for (const [id, cmd] of this.pendingCommands.entries()) {
      if (cmd.status === 'pending') {
        this.approve(id);
        count++;
      }
    }
    logger.info(`Approved ${count} pending commands`);
    return count;
  }

  /**
   * Deny all pending commands
   */
  denyAll(): number {
    let count = 0;
    for (const [id, cmd] of this.pendingCommands.entries()) {
      if (cmd.status === 'pending') {
        this.deny(id);
        count++;
      }
    }
    logger.info(`Denied ${count} pending commands`);
    return count;
  }

  /**
   * Wait for a command to be approved or denied
   */
  waitForApproval(commandId: string, timeout: number = 300000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const cmd = this.pendingCommands.get(commandId);
      if (!cmd) {
        reject(new Error(`Command ${commandId} not found`));
        return;
      }

      if (cmd.status === 'approved') {
        resolve(true);
        return;
      }

      if (cmd.status === 'denied') {
        resolve(false);
        return;
      }

      const timer = setTimeout(() => {
        this.removeAllListeners(`approval-${commandId}`);
        reject(new Error(`Approval timeout for command ${commandId}`));
      }, timeout);

      const handleApproval = (approved: boolean) => {
        clearTimeout(timer);
        this.removeAllListeners(`approval-${commandId}`);
        resolve(approved);
      };

      this.once(`approved-${commandId}`, () => handleApproval(true));
      this.once(`denied-${commandId}`, () => handleApproval(false));
    });
  }

  /**
   * Clear all pending commands
   */
  clearAll(): void {
    this.pendingCommands.clear();
    logger.info('All pending commands cleared');
  }
}
