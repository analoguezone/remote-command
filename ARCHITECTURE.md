# Remote Command MCP Server - Architecture

## Overview

This MCP server enables AI assistants to execute commands on remote hosts via SSH, providing transparent remote execution as if commands were running locally.

## Design Goals

1. **Transparency** - AI assistants don't need to know they're executing remotely
2. **Simplicity** - Direct SSH execution without complex middleware
3. **Reliability** - Robust command execution with proper exit codes and streaming
4. **Safety** - Built-in approval system for dangerous operations
5. **Zero Dependencies** - No software installation required on remote hosts

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                  AI Assistant (Claude Code)                  │
│                 (Believes it's local execution)              │
└──────────────────────┬───────────────────────────────────────┘
                       │ stdio/MCP Protocol
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                                │
│  - Tool handlers (connect, bash, disconnect, status)        │
│  - Command safety classification                            │
│  - Approval workflow management                             │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Remote Session                              │
│  - SSH connection management (ssh2 library)                 │
│  - PTY-based command execution                               │
│  - Real-time output streaming                                │
│  - Exit code handling                                        │
└──────────────────────┬───────────────────────────────────────┘
                       │ SSH with PTY
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Remote Host                               │
│  - Any Linux/Unix system with SSH                           │
│  - No additional software required                           │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Server (`src/mcp/server.ts`)

The MCP protocol layer that exposes tools to AI assistants.

**Responsibilities:**
- Register MCP tools (connect, bash, approve, disconnect, status)
- Handle tool invocations from AI assistants
- Classify commands for safety
- Manage approval workflow
- Format responses for AI consumption

**Key Methods:**
```typescript
class RemoteCommandMCPServer {
  private handleConnect(args): Promise<ToolResponse>
  private handleBash(args): Promise<ToolResponse>
  private handleApprove(args): Promise<ToolResponse>
  private handleDisconnect(): Promise<ToolResponse>
  private handleStatus(): Promise<ToolResponse>
}
```

### 2. Remote Session (`src/remote/session.ts`)

Manages SSH connection lifecycle and command execution.

**Responsibilities:**
- Establish SSH connections with key or password auth
- Execute commands with PTY for proper terminal emulation
- Stream stdout/stderr in real-time
- Capture exit codes
- Detect system characteristics (OS, package manager, etc.)

**Key Methods:**
```typescript
class RemoteSession extends EventEmitter {
  async connect(options: RemoteConnectionOptions): Promise<void>
  async disconnect(): Promise<void>
  async execute(command: string, options?: ExecOptions): Promise<CommandResult>
  async detectSystemInfo(): Promise<SystemInfo>
}
```

**Implementation Details:**
- Uses `ssh2` library for SSH connections
- PTY mode (`pty: true`) provides clean command execution
- Event-driven architecture for connection lifecycle
- Automatic system detection on connect

### 3. Command Safety (`src/utils/command-safety.ts`)

Classification and approval system for dangerous commands.

**Responsibilities:**
- Classify commands as safe, modify, or dangerous
- Generate approval requests with challenge codes
- Verify approvals before execution
- Expire time-limited approvals (60 seconds)

**Classification Levels:**
```typescript
type CommandLevel = 'safe' | 'modify' | 'dangerous';

// Safe: read-only commands (ls, cat, ps, df, etc.)
// Modify: file operations (mkdir, cp, chmod, etc.)
// Dangerous: system changes (apt install, systemctl restart, etc.)
```

**Approval Flow:**
1. Dangerous command detected
2. Generate random challenge code
3. Return approval request to AI
4. User provides challenge code
5. AI calls remote_approve tool
6. Verify challenge and execute command

### 4. Configuration (`src/utils/config.ts`)

Optional configuration for frequently used hosts.

**Responsibilities:**
- Load `config/remotes.json` if present
- Provide host lookup by name
- Support both pre-configured and ad-hoc connections

**Config Format:**
```json
{
  "version": "1.0",
  "remotes": {
    "production": {
      "host": "prod.example.com",
      "user": "ubuntu",
      "port": 22,
      "identityFile": "~/.ssh/prod_key"
    }
  }
}
```

### 5. Logger (`src/utils/logger.ts`)

Structured logging for debugging and audit trails.

**Responsibilities:**
- Log to file and/or console
- Support multiple log levels (DEBUG, INFO, WARN, ERROR)
- Configurable via environment variables

**Configuration:**
```typescript
LOG_LEVEL=DEBUG
LOG_FILE=/tmp/remote-command-mcp.log
```

## Command Execution Flow

### Normal Command (Safe)

```
1. AI calls remote_bash("ls /tmp")
2. MCP Server classifies as "safe"
3. Session.execute() called
4. SSH exec with PTY
5. Stdout/stderr collected
6. Exit code captured
7. Return result to AI
```

### Dangerous Command

```
1. AI calls remote_bash("systemctl restart nginx")
2. MCP Server classifies as "dangerous"
3. Generate approval with challenge code
4. Return approval request to AI
5. User provides challenge: "Execute with code: ABC123"
6. AI calls remote_approve(approval_id, "ABC123")
7. Verify challenge
8. Session.execute() called
9. Return result to AI
```

## Connection Flow

### SSH Connection Lifecycle

```
1. AI calls remote_connect({host, user, port, identity_file})
2. Parse connection string (user@host:port)
3. Load SSH key or use password
4. Establish SSH connection
5. Detect system info (OS, package manager, shell)
6. Emit 'connected' event
7. Return connection status to AI
```

### System Detection

On connect, we detect:
- **OS**: Linux distribution or Darwin
- **Package Manager**: apt, yum, dnf, pacman, zypper, brew
- **Shell**: bash, zsh, fish
- **Root Access**: is_root, can_run_sudo, no_root_access
- **Home Writable**: Can write to home directory

This information helps the AI make intelligent decisions about available commands.

## PTY-Based Execution

### Why PTY?

PTY (Pseudo-Terminal) provides:
- Clean command execution without terminal control codes
- Proper signal handling (Ctrl+C, etc.)
- Exit code capture
- Real-time streaming output
- No additional software on remote host

### Implementation

```typescript
this.ssh.exec(command, { pty: true }, (err, stream) => {
  stream.on('data', (data) => {
    stdout += data.toString();
  });

  stream.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  stream.on('close', (code) => {
    resolve({ stdout, stderr, exitCode: code });
  });
});
```

## Safety System Architecture

### Three-Tier Classification

**Safe Commands** (always allowed):
- Pattern: Read-only operations
- Examples: `ls`, `cat`, `grep`, `ps`, `docker ps`
- No approval required

**Modify Commands** (allowed in interactive mode):
- Pattern: File/directory operations
- Examples: `mkdir`, `touch`, `cp`, `chmod`
- No approval in interactive mode
- Blocked in read-only mode

**Dangerous Commands** (require approval):
- Pattern: System changes, package management, service control
- Examples: `apt install`, `systemctl restart`, `ufw enable`
- Always require approval in interactive mode
- Blocked in read-only mode

### Challenge Code System

Prevents AI from auto-approving dangerous commands:

1. Generate random 6-character alphanumeric code
2. Display to user: "Challenge Code: ABC123"
3. User must explicitly provide code
4. AI cannot guess or generate code
5. Code expires in 60 seconds

### Safety Modes

| Mode | Safe | Modify | Dangerous |
|------|------|--------|-----------|
| `unrestricted` | ✅ Execute | ✅ Execute | ✅ Execute |
| `interactive` | ✅ Execute | ✅ Execute | ⚠️ Requires approval |
| `read-only` | ✅ Execute | ❌ Block | ❌ Block |

## Error Handling

### Connection Errors

- **SSH_AUTH_FAILED**: Invalid credentials or key
- **SSH_TIMEOUT**: Connection timeout (firewall, network)
- **SSH_HOST_UNREACHABLE**: Host not found or unreachable
- **SSH_KEY_NOT_FOUND**: Identity file doesn't exist

### Execution Errors

- **NOT_CONNECTED**: Attempt to execute before connect
- **TIMEOUT**: Command exceeded timeout limit
- **EXEC_FAILED**: SSH exec call failed
- **STREAM_ERROR**: Error reading command output

### Safety Errors

- **APPROVAL_REQUIRED**: Dangerous command needs approval
- **APPROVAL_EXPIRED**: Approval older than 60 seconds
- **APPROVAL_INVALID**: Challenge code mismatch
- **COMMAND_BLOCKED**: Blocked by safety mode

## Performance Considerations

### Connection Pooling

Currently one connection per MCP session:
- Connect once, execute many commands
- Disconnect when conversation ends
- Future: Connection persistence across sessions

### Command Execution

- Default timeout: 120 seconds (configurable)
- Streaming output: Real-time, not buffered
- Exit code: Always captured
- Working directory: Supported via `cd && command`

### Memory Usage

- Minimal: One SSH connection per session
- Output streaming: Incremental, not full buffer
- No persistent state beyond current session

## Security Considerations

### Authentication

- SSH key authentication (preferred)
- Password authentication (supported)
- Keys must have proper permissions (600)
- No key storage in MCP server

### Command Execution

- No command injection - direct exec
- PTY provides isolation
- Exit codes validated
- No shell expansion unless intended

### Audit Trail

All operations logged:
- Connection attempts (success/failure)
- Commands executed
- Dangerous command approvals
- Disconnections

## Testing Strategy

### Unit Tests
- Command classification
- Approval generation/verification
- Config parsing
- System detection

### Integration Tests
- SSH connection
- Command execution
- Output streaming
- Error handling

### Manual Testing
- Various Linux distributions
- Different SSH configurations
- Safety system workflow
- Multi-host switching

## Future Enhancements

### Planned Features

1. **Connection Persistence**
   - Maintain connections across conversations
   - Reconnect automatically on disconnect

2. **File Transfer**
   - Upload/download files via SFTP
   - Bidirectional sync

3. **Port Forwarding**
   - Local/remote port forwarding
   - Dynamic tunnels

4. **Multi-Session**
   - Multiple simultaneous connections
   - Session switching

5. **Enhanced System Detection**
   - Container detection (Docker, Podman)
   - Virtualization detection
   - Distribution-specific capabilities

### Known Limitations

1. **No Interactive Commands**
   - Commands requiring input will hang
   - Use non-interactive flags (e.g., `apt-get -y`)

2. **No Terminal UI**
   - No support for ncurses/TUI applications
   - No vim, nano, htop, etc.

3. **Single Command Per Execution**
   - No persistent shell state between commands
   - Use `cd && command` for directory changes

## Technology Stack

- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 18+
- **SSH Library**: ssh2 1.15+
- **MCP SDK**: @modelcontextprotocol/sdk 0.5+
- **Protocol**: MCP (Model Context Protocol)

## Deployment

### NPM Package
- Published as `@analoguezone/remote-command-mcp`
- Global install or npx execution
- No system-wide dependencies

### MCP Configuration
- stdio transport
- Environment variable configuration
- Optional log file

### Requirements
- Node.js 18+ on local machine
- SSH access to remote hosts
- No requirements on remote hosts (just SSH)

## Comparison with Alternatives

### vs. Warp Warpify
- **Warp**: Proprietary, terminal-integrated, tmux-based
- **This**: Open source, MCP-based, PTY-based, AI-first

### vs. VS Code Remote
- **VS Code**: IDE-specific, persistent connection, file sync
- **This**: AI assistant integration, conversation-scoped, command-focused

### vs. Raw SSH
- **SSH**: Manual execution, no AI integration
- **This**: Transparent to AI, automatic execution, safety system

## Conclusion

This architecture provides a clean, simple, and reliable way to execute remote commands through AI assistants. By using direct SSH with PTY and avoiding complex middleware, we achieve:

- **Reliability**: Simple execution path, fewer failure points
- **Compatibility**: Works with any SSH-enabled host
- **Safety**: Built-in approval system protects against accidents
- **Transparency**: AI assistants work naturally without knowing they're remote

The architecture is designed for extensibility while maintaining simplicity in the core execution path.
