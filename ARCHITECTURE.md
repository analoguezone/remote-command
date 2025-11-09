# Remote Command Architecture

## Overview

This project provides a Warp.dev warpify alternative that enables AI agents (like Claude Code) to seamlessly execute commands on remote hosts as if they were local.

## Warp's Warpify Analysis

### Key Components from Dumped Commands

1. **Escape Sequence Communication**
   - OSC (Operating System Command): `\e]9278;f;{...}\a` for hooks/events
   - DCS (Device Control String): `\033\120\044\144%s\234` for logging
   - Bidirectional communication between client and remote

2. **Tmux Control Mode (`-CC`)**
   - Provides parseable, structured output
   - Outputs control messages: `%begin`, `%end`, `%output`, `%window-add`, etc.
   - Eliminates need for screen scraping
   - Example: `%begin 1730812345 0 1` followed by actual output, then `%end 1730812345 0 1`

3. **System Detection**
   ```bash
   - OS detection (Darwin/Linux)
   - Package manager (homebrew, pacman, zypper, dnf, yum, apt)
   - Shell type (fish, zsh, bash)
   - Root access level (no_root_access, can_run_sudo, is_root)
   - Home directory writability
   ```

4. **Tmux Version Validation**
   - Requires tmux >= 2.9
   - Checks for Warp bundled tmux ($HOME/.warp/tmux/execute_tmux.sh)
   - Falls back to system tmux

## Proposed Architecture

### Design Goals

1. **Transparency**: Claude Code should not know it's executing remotely
2. **Streaming**: Real-time output streaming for multi-command operations
3. **Queuing**: Handle multiple concurrent commands properly
4. **Error Handling**: Graceful degradation and clear error messages
5. **Session Management**: Connect/disconnect/reconnect capabilities

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code CLI                         │
│                    (Believes it's local)                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Command Interceptor                         │
│  - Intercepts bash/shell commands                           │
│  - Routes to local or remote execution                       │
│  - Mimics local command interface                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Command Router                             │
│  - Determines execution target (local/remote)                │
│  - Manages command queue                                     │
│  - Handles parallel/sequential execution                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         ▼                            ▼
┌──────────────────┐        ┌──────────────────────────────────┐
│ Local Executor   │        │     Remote Executor              │
└──────────────────┘        │  - SSH tunnel manager            │
                            │  - Tmux control mode interface    │
                            │  - Output parser/streamer         │
                            └──────────────────────────────────┘
```

### Core Components

#### 1. Remote Session Manager
```typescript
class RemoteSession {
  - connect(host, options): Promise<void>
  - disconnect(): Promise<void>
  - isConnected(): boolean
  - execute(command, options): Promise<CommandResult>
  - stream(command, callback): Promise<void>
}
```

#### 2. Tmux Control Mode Parser
```typescript
class TmuxControlParser {
  - parseControlOutput(line): ControlMessage
  - extractPanes(): Pane[]
  - handleWindowEvents(event): void
  - getCommandOutput(windowId): string
}

interface ControlMessage {
  type: 'begin' | 'end' | 'output' | 'error' | 'window-add' | 'exit'
  timestamp?: number
  pane?: number
  window?: number
  data?: string
}
```

#### 3. Command Queue Manager
```typescript
class CommandQueue {
  - enqueue(command, priority): CommandHandle
  - executeNext(): Promise<void>
  - stream(command, onData): CommandHandle
  - cancelAll(): void
  - waitForCompletion(): Promise<void>
}
```

#### 4. SSH Tunnel Manager
```typescript
class SSHTunnel {
  - establish(host, options): Promise<void>
  - keepAlive(): void
  - reconnect(): Promise<void>
  - close(): void
}
```

## Implementation Strategy

### Phase 1: Core Infrastructure (MVP)
1. SSH connection management
2. Tmux control mode integration
3. Basic command execution
4. Output streaming

### Phase 2: Claude Code Integration
1. Command interception wrapper
2. Local command mimicry
3. Path translation (local ↔ remote)
4. File sync capabilities (optional)

### Phase 3: Advanced Features
1. Multi-host management
2. Session persistence
3. Command history sync
4. Escape sequence passthrough

## Tmux Control Mode Protocol

### Control Mode Commands

When tmux runs with `-CC`:
```
%begin <time> <flags> <pane-id>
... actual command output ...
%end <time> <flags> <pane-id> <exit-code>

%window-add @<window-id>
%window-close @<window-id>
%output %<pane-id> <output-data>
%exit [reason]
```

### Our Usage Pattern

```bash
# Start control mode with named socket
tmux -Lremote-cmd -CC

# Create window and execute command
new-window -P -F "#{pane_id}" "command here"

# Parse output blocks
# %begin ... %end denote command boundaries

# Multiple commands in sequence
send-keys -t %1 "command1" Enter
send-keys -t %1 "command2" Enter
```

## Path Translation Strategy

### Problem
Claude Code works with local paths like `/home/user/project/src/file.ts`
Remote host has paths like `/home/ubuntu/project/src/file.ts`

### Solutions

**Option 1: Working Directory Sync**
- Maintain same relative paths
- Always execute from project root
- Use `cd` to navigate within remote

**Option 2: Path Mapping Configuration**
```json
{
  "pathMappings": {
    "/home/user/project": "/home/ubuntu/project"
  }
}
```

**Option 3: Virtual File System (Advanced)**
- SSHFS or similar mounting
- Transparent path translation
- File watching for changes

## Command Interception for Claude Code

### Wrapper Script Approach

Create a wrapper that Claude Code calls instead of direct `bash`:

```typescript
// remote-command-wrapper.ts
async function executeBash(command: string, options: BashOptions) {
  if (isConnectedToRemote()) {
    return await remoteSession.execute(command, {
      cwd: translatePath(options.cwd),
      timeout: options.timeout,
      streaming: true
    });
  } else {
    return await localExec(command, options);
  }
}
```

### Integration Methods

**Method 1: Environment Variable**
```bash
export BASH_COMMAND_WRAPPER="/path/to/remote-command-wrapper"
```

**Method 2: Shell Alias**
```bash
alias bash="remote-command-wrapper bash"
```

**Method 3: MCP Server** (Recommended for Claude Code)
```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/path/to/remote-command-mcp-server.js"]
    }
  }
}
```

## Escape Sequence Handling

### Warp's Sequences

1. **Hook Messages** (OSC 9278)
   ```
   \e]9278;f;{"hook": "InitSsh", "value": {...}}\a
   ```

2. **Log Messages** (DCS)
   ```
   \033\120\044\144<hex-encoded-json>\234
   ```

### Our Approach

- **Parse and forward**: Detect escape sequences in remote output
- **Status updates**: Send progress/status back to Claude Code
- **Error reporting**: Use escape sequences for error communication

## Configuration File Format

```json
{
  "version": "1.0",
  "remotes": {
    "production": {
      "host": "prod.example.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/id_rsa",
      "pathMappings": {
        "/home/user/project": "/home/ubuntu/app"
      },
      "tmux": {
        "socketName": "remote-cmd",
        "shellPath": "/bin/bash"
      }
    },
    "staging": {
      "host": "staging.example.com",
      "user": "deploy",
      "identityFile": "~/.ssh/id_rsa"
    }
  },
  "activeRemote": null,
  "fallbackToLocal": true,
  "commandTimeout": 300000
}
```

## CLI Usage

```bash
# Connect to remote
remote-cmd connect production

# Execute command (transparently routed to remote)
bash -c "ls -la /app"

# Disconnect
remote-cmd disconnect

# List configured remotes
remote-cmd list

# Status
remote-cmd status
```

## Benefits Over Other Solutions

1. **No Terminal Emulation**: Uses tmux control mode for clean, parseable output
2. **Streaming**: Real-time output as commands execute
3. **Multiplexing**: Multiple commands can run concurrently in different tmux panes
4. **Session Persistence**: Tmux sessions survive disconnections
5. **Native Feel**: Claude Code sees normal command outputs, not terminal escape codes

## Technical Challenges

1. **PTY Handling**: Some commands require PTY (interactive prompts)
2. **Signal Forwarding**: Ctrl+C and other signals need proper handling
3. **Exit Codes**: Must accurately capture and report exit codes
4. **Environment Variables**: Need to sync or translate env vars
5. **File Descriptor Redirects**: Handle stdin/stdout/stderr properly

## Next Steps

1. Implement SSH connection manager
2. Create tmux control mode parser
3. Build command execution layer
4. Develop command queue system
5. Create MCP server for Claude Code integration
6. Add configuration management
7. Build CLI interface
