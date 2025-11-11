/**
 * Common type definitions for remote command execution
 */

export interface RemoteConfig {
  version: string;
  remotes: Record<string, RemoteHost>;
}

export interface RemoteHost {
  host: string;
  user: string;
  identityFile: string;
  port?: number;
  pathMappings?: Record<string, string>;
  tmux?: TmuxConfig;
}

export interface TmuxConfig {
  socketName?: string;
  shellPath?: string;
}

export interface SSHOptions {
  host: string;
  username: string;
  port?: number;
  privateKey?: Buffer;
  identityFile?: string;
  passphrase?: string;
  password?: string;
}

export interface ExecOptions {
  command: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface SystemInfo {
  os: string;
  pkg?: string;
  shell: string;
  root_access: 'no_root_access' | 'can_run_sudo' | 'is_root';
  writable_home: boolean;
}

export interface ControlMessage {
  type: 'begin' | 'end' | 'output' | 'error' | 'window-add' | 'window-close' | 'exit' | 'layout-change';
  timestamp?: number;
  flags?: number;
  pane?: number;
  window?: number;
  data?: string;
  exitCode?: number;
  reason?: string;
}

export interface QueuedCommand {
  id: string;
  command: string;
  timeout: number;
  cwd?: string;
  env?: Record<string, string>;
  resolve?: (result: CommandResult) => void;
  reject?: (error: Error) => void;
  startTime?: number;
  outputCallback?: (data: string) => void;
}

export interface SessionStatus {
  connected: boolean;
  host?: string;
  remoteHost?: string;
  user?: string;
  systemInfo?: SystemInfo;
  connectedAt?: Date;
  commandsExecuted?: number;
  approvalMode?: boolean;
  pendingApprovals?: number;
}

export interface PendingCommand {
  id: string;
  command: string;
  cwd?: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed';
}

export interface ApprovalAction {
  commandId: string;
  action: 'approve' | 'deny' | 'refine';
  refinedCommand?: string;
}

export class RemoteCommandError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RemoteCommandError';
  }
}

export class TmuxError extends Error {
  constructor(
    message: string,
    public reason: string,
    public systemInfo?: SystemInfo
  ) {
    super(message);
    this.name = 'TmuxError';
  }
}
