# Remote Command MCP Server

**Execute commands on remote hosts seamlessly with AI coding assistants**

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that enables AI assistants like [Claude Code](https://claude.ai/code) to execute commands on remote hosts via SSH - as if they were running locally.

[![npm version](https://badge.fury.io/js/%40analoguezone%2Fremote-command-mcp.svg)](https://www.npmjs.com/package/@analoguezone/remote-command-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **🎯 Ad-Hoc Connections** - Connect to any server instantly without pre-configuration
- **🔄 Transparent Execution** - AI assistants execute commands as if running locally
- **🔒 Built-in Safety** - Approval system for dangerous commands (system changes, package installs, etc.)
- **📡 Real-time Streaming** - Live command output via SSH PTY
- **🖥️ Multi-Host Support** - Switch between multiple remote hosts in one conversation
- **🔐 Flexible Authentication** - SSH keys (auto-detected), passwords, or custom key files
- **⚙️ Optional Configuration** - Pre-configure frequently used hosts for convenience

## Quick Start

### Installation

```bash
npm install -g @analoguezone/remote-command-mcp
```

Or use directly with `npx` (no installation needed):

```bash
npx @analoguezone/remote-command-mcp
```

### Claude Code / OpenCode Integration

Add to your `opencode.json` or Claude Code configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["npx", "-y", "@analoguezone/remote-command-mcp"],
      "enabled": true,
      "environment": {
        "SAFETY_MODE": "interactive",
        "LOG_LEVEL": "INFO",
        "LOG_FILE": "/tmp/remote-command-mcp.log"
      }
    }
  }
}
```

Restart your AI assistant, and you're ready to go!

## Usage

### Connect to Any Remote Host

No configuration needed - just tell your AI assistant:

```
Connect to ubuntu@192.168.1.100
```

With custom port:
```
Connect to root@server.example.com on port 2222
```

With specific SSH key:
```
Connect to deploy@staging.com using key ~/.ssh/staging_key
```

### Execute Commands

Once connected, simply ask your AI:

```
Check what Docker containers are running
List the 10 largest files in /var/log
Show me the last 50 lines of nginx error log
```

Your AI assistant will automatically execute appropriate commands and show results.

### Safety System

Dangerous commands require explicit approval:

```
User: "Restart nginx"
AI: ⚠️  DANGEROUS COMMAND - Approval Required
    Command: systemctl restart nginx
    Challenge Code: XY7Z9K

User: "Execute with challenge code: XY7Z9K"
AI: ✅ Command approved and executed
```

See [SAFETY_SYSTEM.md](./SAFETY_SYSTEM.md) for details.

## Configuration (Optional)

For frequently used servers, create `config/remotes.json`:

```json
{
  "version": "1.0",
  "remotes": {
    "production": {
      "host": "prod.example.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/prod_key",
      "port": 22
    },
    "staging": {
      "host": "staging.example.com",
      "user": "deploy",
      "identityFile": "~/.ssh/staging_key"
    }
  }
}
```

Then use short names:
```
Connect to production
```

## MCP Tools

### `remote_connect`

Connect to a remote host via SSH.

**Parameters:**
- `host` (string, required) - Config name or `user@host[:port]`
- `user` (string, optional) - SSH username
- `port` (number, optional) - SSH port (default: 22)
- `identity_file` (string, optional) - Path to SSH private key
- `password` (string, optional) - Password authentication

### `remote_bash`

Execute a bash command on the connected remote host.

**Parameters:**
- `command` (string, required) - The bash command to execute
- `timeout` (number, optional) - Timeout in ms (default: 120000)
- `cwd` (string, optional) - Working directory

### `remote_approve`

Approve a pending dangerous command execution.

**Parameters:**
- `approval_id` (string, required) - Approval ID from pending command
- `challenge` (string, required) - Challenge code to verify human approval

### `remote_disconnect`

Disconnect from the current remote host.

### `remote_status`

Get current connection status and system information.

## Safety Modes

Configure via `SAFETY_MODE` environment variable:

| Mode | Description | Use Case |
|------|-------------|----------|
| `interactive` (default) | Dangerous commands require approval | Development, debugging |
| `read-only` | Only read commands allowed | Production monitoring |
| `unrestricted` | No restrictions (⚠️ use with caution) | Isolated test environments |

## Requirements

- Node.js >= 18.0.0
- SSH access to remote hosts
- SSH keys or password for authentication

**Remote hosts:**
- Any Linux/Unix system with SSH access
- No additional software installation required on remote hosts

## How It Works

```
AI Assistant → MCP Protocol → SSH Connection → Remote Host
      ↑                                              ↓
      └────────── Streaming Output ─────────────────┘
```

1. AI assistant connects to MCP server via stdio
2. MCP server establishes SSH connection with PTY
3. Commands execute on remote host with real-time streaming
4. Output returns to AI assistant as if running locally

## Examples

### System Administration

```
User: "Check if nginx is running and view its configuration"
AI executes:
  - systemctl status nginx
  - nginx -t
  - cat /etc/nginx/nginx.conf
```

### Docker Diagnostics

```
User: "Diagnose why the web container can't reach the database"
AI executes:
  - docker ps
  - docker network ls
  - docker logs web-container
  - docker exec web-container ping db-container
```

### Log Analysis

```
User: "Find all 500 errors in the last hour"
AI executes:
  - find /var/log/nginx -name "*.log" -mmin -60
  - grep "HTTP/1.1\" 500" /var/log/nginx/error.log
```

## Troubleshooting

### Connection Issues

```bash
# Test SSH manually
ssh -i ~/.ssh/id_rsa user@host

# Check key permissions
chmod 600 ~/.ssh/id_rsa
```

### Enable Debug Logging

```json
"environment": {
  "LOG_LEVEL": "DEBUG",
  "LOG_FILE": "/tmp/remote-command-mcp.log"
}
```

Then check logs:
```bash
tail -f /tmp/remote-command-mcp.log
```

### AI Doesn't See Tools

1. Verify `"enabled": true` in MCP config
2. Restart AI assistant after config changes
3. Check server starts without errors:
   ```bash
   npx @analoguezone/remote-command-mcp
   ```

## Architecture

This MCP server uses:
- **ssh2** library for SSH connections
- **PTY (Pseudo-Terminal)** for clean command execution
- **EventEmitter** for session lifecycle management
- **Pattern-based** command safety classification

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Development

### Local Setup

```bash
git clone https://github.com/analoguezone/remote-command.git
cd remote-command
npm install
npm run build
```

### Use Local Version

In your MCP config:

```json
{
  "command": ["node", "/absolute/path/to/remote-command/dist/index.js"]
}
```

### Watch Mode

```bash
npm run dev
```

## Comparison with Alternatives

| Feature | remote-command-mcp | Raw SSH | VS Code Remote |
|---------|-------------------|---------|----------------|
| AI Integration | ✅ Native (MCP) | ❌ | ❌ |
| Streaming Output | ✅ Real-time | ❌ | ✅ |
| Command Safety | ✅ Built-in | ❌ | ❌ |
| Zero Configuration | ✅ Ad-hoc connections | ❌ | ❌ |
| Session Management | ✅ Per-conversation | ❌ | ✅ |
| Open Source | ✅ MIT | ✅ | Partial |

## Contributing

Contributions welcome! Please:

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the technical design
2. Open an issue to discuss significant changes
3. Submit PRs with clear descriptions and tests

## Documentation

- [SAFETY_SYSTEM.md](./SAFETY_SYSTEM.md) - Command safety and approval workflow
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture and implementation details
- [AD_HOC_CONNECTIONS.md](./AD_HOC_CONNECTIONS.md) - Connection examples and usage patterns
- [PUBLISHING.md](./PUBLISHING.md) - Guide for publishing to npm (maintainers)

## License

[MIT](./LICENSE)

## Credits

Created by [analoguezone](https://github.com/analoguezone)

Inspired by the need for seamless remote command execution in AI-assisted development workflows.

---

**Note:** This is an independent open-source project and is not affiliated with Anthropic, Claude, or any other AI assistant platform.
