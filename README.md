# Remote Command MCP Server

A Warp.dev warpify alternative that enables Claude Code to seamlessly execute commands on remote hosts as if they were local.

## Overview

This project provides an MCP (Model Context Protocol) server that integrates with Claude Code, allowing AI agents to work on remote machines transparently. It uses SSH and tmux control mode to execute commands remotely while providing a local-like experience.

## Features

- **Transparent Remote Execution**: Claude Code doesn't know it's executing remotely
- **Streaming Output**: Real-time command output streaming
- **Command Queuing**: Proper handling of sequential and parallel commands
- **Session Management**: Connect, disconnect, and manage remote sessions
- **Tmux Control Mode**: Clean, parseable output using tmux `-CC` flag
- **Multi-host Support**: Configure and switch between multiple remote hosts

## How It Works

```
Claude Code → MCP Server → SSH + Tmux Control Mode → Remote Host
     ↑                                                      ↓
     └──────────── Streaming Output ───────────────────────┘
```

1. Claude Code connects to the MCP server via stdio
2. MCP server establishes SSH connection with tmux control mode
3. Commands are executed on remote host
4. Output is streamed back to Claude Code in real-time
5. Claude Code processes output as if it were local

## Installation

```bash
npm install
npm run build
```

## Configuration

Create `config/remotes.json`:

```json
{
  "version": "1.0",
  "remotes": {
    "production": {
      "host": "prod.example.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/id_rsa",
      "port": 22,
      "pathMappings": {
        "/home/user/project": "/home/ubuntu/app"
      }
    },
    "staging": {
      "host": "staging.example.com",
      "user": "deploy",
      "identityFile": "~/.ssh/id_rsa"
    }
  }
}
```

## Claude Code Integration

Add to your Claude Code MCP settings (`.claude/settings.json` or global settings):

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/absolute/path/to/remote-command/dist/index.js"]
    }
  }
}
```

## Usage

### Connect to Remote Host

Ask Claude Code:
```
Connect to my production server
```

Claude Code will call:
```javascript
remote_connect({ host: "production" })
```

### Execute Commands

Ask Claude Code:
```
Check what Docker containers are running
```

Claude Code will call:
```javascript
remote_bash({ command: "docker ps -a" })
```

### Multi-Command Operations

Ask Claude Code:
```
Check Docker networking issues - look at container networks,
check iptables rules, and verify DNS resolution
```

Claude Code will automatically:
1. Execute `docker network ls`
2. Execute `docker network inspect bridge`
3. Execute `sudo iptables -L`
4. Execute `docker exec <container> nslookup google.com`
5. Stream all outputs back in real-time

### Disconnect

Ask Claude Code:
```
Disconnect from the remote server
```

## MCP Tools

### `remote_connect`

Connects to a configured remote host.

**Parameters:**
- `host` (string): Remote host identifier from config or `user@host` format
- `identity_file` (string, optional): SSH key path

**Example:**
```javascript
{
  "host": "production",
  "identity_file": "~/.ssh/id_rsa"
}
```

### `remote_bash`

Executes bash commands on the connected remote host.

**Parameters:**
- `command` (string): The bash command to execute
- `timeout` (number, optional): Timeout in milliseconds (default: 120000)
- `cwd` (string, optional): Working directory

**Example:**
```javascript
{
  "command": "ls -la /var/log",
  "timeout": 60000,
  "cwd": "/home/ubuntu"
}
```

### `remote_disconnect`

Disconnects from the current remote host.

### `remote_status`

Returns current connection status and system information.

**Returns:**
```json
{
  "connected": true,
  "host": "production",
  "remote_host": "prod.example.com",
  "user": "ubuntu",
  "system_info": {
    "os": "Linux",
    "pkg": "apt",
    "shell": "bash",
    "root_access": "can_run_sudo",
    "writable_home": true
  }
}
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

See [IMPLEMENTATION_STRATEGY.md](./IMPLEMENTATION_STRATEGY.md) for implementation details.

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

## How Tmux Control Mode Works

Tmux control mode (`-CC`) provides structured, parseable output instead of terminal rendering:

```
%begin 1699564800 0 0
ls: total 48
drwxr-xr-x 2 user user 4096 Nov  9 10:00 src
%end 1699564800 0 0 0
```

We parse these control messages to:
- Track command boundaries (`%begin` / `%end`)
- Extract output streams
- Capture exit codes
- Handle multiple concurrent commands

## Warp Warpify Analysis

Warp uses:
1. **Escape sequences** for bidirectional communication
2. **Tmux control mode** for clean output parsing
3. **System detection** for compatibility checking
4. **Bootstrap scripts** for remote setup

We implement similar functionality but integrate with Claude Code via MCP instead of Warp's proprietary protocol.

## Troubleshooting

### Connection Issues

If connection fails:
1. Check SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
2. Test SSH manually: `ssh -i ~/.ssh/id_rsa user@host`
3. Check `config/remotes.json` syntax

### Tmux Not Found

The server will attempt to bootstrap tmux installation. If it fails:
1. Manually install tmux: `sudo apt-get install tmux` (Ubuntu/Debian)
2. Verify version: `tmux -V` (must be >= 2.9)

### Commands Hang

If commands hang:
1. Check timeout settings (default: 2 minutes)
2. Verify command works when run manually via SSH
3. Check tmux session: `tmux -Lremote-cmd list-sessions`

### Claude Code Doesn't See Tools

1. Verify MCP server is configured in Claude Code settings
2. Restart Claude Code after adding MCP server
3. Check server logs for errors

## Comparison with Other Solutions

| Feature | This Project | Raw SSH | Warp Warpify | VS Code Remote |
|---------|-------------|---------|--------------|----------------|
| AI Agent Integration | ✅ Native (MCP) | ❌ | ✅ Proprietary | ❌ |
| Streaming Output | ✅ Real-time | ❌ | ✅ | ✅ |
| Command Queuing | ✅ | ❌ | ✅ | ❌ |
| Session Persistence | ✅ (tmux) | ❌ | ✅ | ✅ |
| Zero Terminal Emulation | ✅ | ❌ | ✅ | ❌ |
| Open Source | ✅ | ✅ | ❌ | Partial |

## Roadmap

- [x] Basic SSH connection
- [x] Tmux control mode parser
- [x] MCP server implementation
- [x] Command queueing
- [ ] Path translation/mapping
- [ ] File sync capabilities
- [ ] Multi-host session management
- [ ] Bootstrap script for automatic tmux installation
- [ ] Escape sequence passthrough
- [ ] Connection persistence across Claude Code restarts

## Contributing

Contributions welcome! Please read the architecture and implementation strategy documents first.

## License

MIT

## Credits

Inspired by Warp.dev's warpify feature. This is an independent implementation designed for Claude Code integration.
