# Remote Command MCP Server

A Warp.dev warpify alternative that enables OpenCode to seamlessly execute commands on remote hosts as if they were local.

## 🚀 Key Feature: Ad-Hoc Connections

**Connect to ANY remote host on-the-fly without pre-configuration!**

Simply tell OpenCode:
- "Connect to ubuntu@192.168.1.100"
- "Connect to root@server.com on port 2222"
- "Connect to deploy@staging.example.com using key ~/.ssh/staging_key"

No need to edit config files or leave the conversation. Switch between servers seamlessly!

📖 See [AD_HOC_CONNECTIONS.md](./AD_HOC_CONNECTIONS.md) for detailed examples.

## Overview

This project provides an MCP (Model Context Protocol) server that integrates with OpenCode (and other MCP-compatible AI coding assistants), allowing AI agents to work on remote machines transparently. It uses SSH and tmux control mode to execute commands remotely while providing a local-like experience.

## Features

- **🎯 Ad-Hoc Connections**: Connect to any server instantly without pre-configuration
- **🔄 Transparent Remote Execution**: OpenCode doesn't know it's executing remotely
- **📡 Streaming Output**: Real-time command output streaming
- **📋 Command Queuing**: Proper handling of sequential and parallel commands
- **🔌 Session Management**: Connect, disconnect, and manage remote sessions within chat
- **⚡ Tmux Control Mode**: Clean, parseable output using tmux `-CC` flag
- **🖥️ Multi-host Support**: Switch between multiple remote hosts seamlessly
- **🔐 Flexible Auth**: Supports SSH keys (auto-detected) and password authentication
- **⚙️ Optional Config**: Pre-configure frequently used hosts for convenience

## How It Works

```
OpenCode → MCP Server → SSH + Tmux Control Mode → Remote Host
    ↑                                                      ↓
    └──────────── Streaming Output ───────────────────────┘
```

1. OpenCode connects to the MCP server via stdio
2. MCP server establishes SSH connection with tmux control mode
3. Commands are executed on remote host
4. Output is streamed back to OpenCode in real-time
5. OpenCode processes output as if it were local

## Installation

```bash
npm install
npm run build
```

## Configuration (Optional)

Configuration is **completely optional**. You can connect to any server on-the-fly without any config file.

However, for frequently used servers, you can create `config/remotes.json` for convenience:

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

Then you can use short names: `"Connect to production"` instead of typing full host details.

## OpenCode Integration

### Option 1: NPM Package (Recommended - Once Published)

If the package is published to npm, you can use:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["npx", "-y", "@analoguezone/remote-command-mcp"],
      "enabled": true,
      "environment": {
        "LOG_LEVEL": "INFO"
      },
      "timeout": 10000
    }
  }
}
```

**Note:** This will automatically download and run the latest version from npm.

### Option 2: Local Development

For local development or if not published to npm yet:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["node", "/absolute/path/to/remote-command/dist/index.js"],
      "enabled": true,
      "environment": {
        "LOG_LEVEL": "INFO"
      },
      "timeout": 10000
    }
  }
}
```

**Important:** Replace `/absolute/path/to/remote-command` with the actual absolute path where you cloned this repository.

To find the absolute path:
```bash
cd /path/to/remote-command
pwd
# Use the output in your opencode.json
```

## Usage

### Connect to Any Remote Host (Ad-Hoc)

**No configuration needed!** Just tell OpenCode:

```
Connect to ubuntu@192.168.1.100
```

Or with custom port:
```
Connect to root@server.example.com on port 2222
```

Or with specific SSH key:
```
Connect to deploy@staging.com using key ~/.ssh/staging_key
```

See [AD_HOC_CONNECTIONS.md](./AD_HOC_CONNECTIONS.md) for 20+ more examples.

### Connect Using Pre-Configured Host

If you have hosts in `config/remotes.json`:

```
Connect to production
```

### Execute Commands

Once connected, ask OpenCode:
```
Check what Docker containers are running
```

OpenCode will automatically execute the appropriate commands on the remote host.

### Multi-Command Operations

Ask OpenCode:
```
Check Docker networking issues - look at container networks,
check iptables rules, and verify DNS resolution
```

OpenCode will automatically:
1. Execute `docker network ls`
2. Execute `docker network inspect bridge`
3. Execute `sudo iptables -L`
4. Execute `docker exec <container> nslookup google.com`
5. Stream all outputs back in real-time

### Disconnect

Ask OpenCode:
```
Disconnect from the remote server
```

## MCP Tools

### `remote_connect`

Connects to any remote host. Supports both ad-hoc connections and pre-configured hosts.

**Parameters:**
- `host` (string, required): Config name, `user@host`, `user@host:port`, or just hostname
- `user` (string, optional): SSH username (overrides user in host string)
- `port` (number, optional): SSH port (default: 22)
- `identity_file` (string, optional): Path to SSH private key (auto-detects if not specified)
- `password` (string, optional): Password for authentication (less secure)

**Examples:**

Ad-hoc connection:
```javascript
{
  "host": "ubuntu@192.168.1.100",
  "port": 2222,
  "identity_file": "~/.ssh/mykey"
}
```

Pre-configured host:
```javascript
{
  "host": "production"
}
```

Simple connection (auto-detects key):
```javascript
{
  "host": "root@server.com"
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

### OpenCode Doesn't See Tools

1. Verify MCP server is configured in `opencode.json`
2. Check that `"enabled": true` is set
3. Restart OpenCode after adding/modifying MCP server config
4. Check server logs for errors (set `"LOG_LEVEL": "DEBUG"` in environment)
5. Test the server manually: `node /path/to/remote-command/dist/index.js`

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
- [ ] Connection persistence across OpenCode restarts

## Contributing

Contributions welcome! Please read the architecture and implementation strategy documents first.

## License

MIT

## Credits

Inspired by Warp.dev's warpify feature. This is an independent implementation designed for OpenCode and other MCP-compatible AI coding assistants.
