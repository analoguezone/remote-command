# Setup Guide

Complete guide to setting up and using the Remote Command MCP Server with Claude Code.

## Prerequisites

1. **Node.js** >= 18.0.0
2. **Claude Code** CLI installed
3. **SSH access** to remote hosts
4. **SSH keys** configured for passwordless authentication
5. **Tmux** >= 2.9 installed on remote hosts

## Installation

### 1. Clone and Build

```bash
cd /path/to/remote-command
npm install
npm run build
```

### 2. Configure Remote Hosts

Copy the example configuration:

```bash
cp config/remotes.example.json config/remotes.json
```

Edit `config/remotes.json` to add your remote hosts:

```json
{
  "version": "1.0",
  "remotes": {
    "my-server": {
      "host": "server.example.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/id_rsa",
      "port": 22
    }
  }
}
```

### 3. Test SSH Connection

Verify you can connect to your remote host:

```bash
ssh -i ~/.ssh/id_rsa ubuntu@server.example.com
```

If this works without password prompt, you're good to go.

### 4. Verify Remote Tmux

SSH into your remote host and check tmux:

```bash
ssh ubuntu@server.example.com
tmux -V
# Should output: tmux 2.9 or higher
```

If tmux is not installed or version is too old:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install tmux
```

**CentOS/RHEL:**
```bash
sudo yum install tmux
```

**macOS:**
```bash
brew install tmux
```

## Claude Code Integration

### Method 1: Global MCP Configuration (Recommended)

Add to your Claude Code global settings:

**Location:** `~/.config/claude-code/settings.json` or use Claude Code's settings UI

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

**Important:** Use the absolute path to `dist/index.js`

### Method 2: Project-Specific Configuration

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/absolute/path/to/remote-command/dist/index.js"],
      "env": {
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Restart Claude Code

After adding the MCP server configuration, restart Claude Code:

```bash
# If running in terminal
exit
# Then start again
```

## Usage Examples

### Connect to Remote

Ask Claude Code:

```
Connect to my-server
```

Or if not in config:

```
Connect to ubuntu@192.168.1.100
```

### Execute Commands

Once connected, you can ask Claude Code to run any command:

```
Check what Docker containers are running
```

Claude Code will automatically call `remote_bash` with the appropriate command.

### Multi-Command Operations

```
Investigate why my Node.js app is slow:
1. Check CPU usage
2. Look at memory consumption
3. Check for any error logs in /var/log/app.log
4. See what ports are listening
```

Claude Code will execute multiple commands sequentially and analyze the results.

### Disconnect

```
Disconnect from the remote server
```

### Check Status

```
What's the status of my remote connection?
```

## Configuration Options

### Remote Host Configuration

```json
{
  "host": "server.example.com",      // Required: hostname or IP
  "user": "ubuntu",                   // Required: SSH username
  "identityFile": "~/.ssh/id_rsa",   // Required: path to SSH private key
  "port": 22,                         // Optional: SSH port (default: 22)
  "pathMappings": {                   // Optional: path translation
    "/local/path": "/remote/path"
  },
  "tmux": {                           // Optional: tmux settings
    "socketName": "remote-cmd",       // Socket name (default: remote-cmd)
    "shellPath": "/bin/bash"          // Shell to use (default: /bin/bash)
  }
}
```

### Environment Variables

- `LOG_LEVEL`: Set logging level (DEBUG, INFO, WARN, ERROR)
- `CONFIG_PATH`: Custom path to config file

Example:

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/path/to/remote-command/dist/index.js"],
      "env": {
        "LOG_LEVEL": "DEBUG",
        "CONFIG_PATH": "/custom/path/to/config.json"
      }
    }
  }
}
```

## Troubleshooting

### "Not connected" error

**Problem:** Claude Code shows "Not connected to any remote host"

**Solution:**
1. Ask Claude Code to connect first: "Connect to my-server"
2. Check if the remote is configured in `config/remotes.json`
3. Verify SSH connection works manually

### SSH connection fails

**Problem:** Connection timeout or authentication failure

**Solution:**
1. Test SSH manually: `ssh -i ~/.ssh/id_rsa user@host`
2. Check SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
3. Verify host is reachable: `ping host`
4. Check SSH key is added to remote: `cat ~/.ssh/id_rsa.pub` should be in remote's `~/.ssh/authorized_keys`

### "TmuxNotInstalled" error

**Problem:** Remote host doesn't have tmux installed

**Solution:**
1. SSH into remote host
2. Install tmux (see installation commands above)
3. Reconnect

### "UnsupportedTmuxVersion" error

**Problem:** Tmux version is too old (< 2.9)

**Solution:**
1. Update tmux on remote host
2. Or compile newer version from source:

```bash
# On remote host
sudo apt-get install libevent-dev libncurses-dev
wget https://github.com/tmux/tmux/releases/download/3.3a/tmux-3.3a.tar.gz
tar -xzf tmux-3.3a.tar.gz
cd tmux-3.3a
./configure
make
sudo make install
```

### Commands hang or timeout

**Problem:** Commands don't complete or timeout

**Solution:**
1. Increase timeout: The default is 2 minutes
2. Check if command works when run manually via SSH
3. Check remote host resources: `top`, `df -h`
4. View tmux sessions: `tmux -Lremote-cmd list-sessions`
5. Kill stuck session: `tmux -Lremote-cmd kill-server`

### MCP server not recognized by Claude Code

**Problem:** Claude Code doesn't show the remote command tools

**Solution:**
1. Verify absolute path in config (not relative!)
2. Ensure `dist/index.js` exists: `ls /path/to/remote-command/dist/index.js`
3. Test MCP server manually:
   ```bash
   node /path/to/remote-command/dist/index.js
   # Should start without errors
   ```
4. Check Claude Code logs for errors
5. Restart Claude Code completely

### Permission denied (publickey)

**Problem:** SSH authentication fails

**Solution:**
1. Check SSH key is loaded: `ssh-add -l`
2. Add key to agent: `ssh-add ~/.ssh/id_rsa`
3. Verify key on remote: `ssh-copy-id -i ~/.ssh/id_rsa.pub user@host`
4. Check remote sshd config allows key auth: `PubkeyAuthentication yes` in `/etc/ssh/sshd_config`

## Advanced Usage

### Path Mappings

If your local project path differs from remote:

```json
{
  "remotes": {
    "production": {
      "host": "prod.example.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/id_rsa",
      "pathMappings": {
        "/home/myuser/projects/myapp": "/var/www/myapp"
      }
    }
  }
}
```

Then when you execute commands with `cwd`:

```javascript
// Claude Code internally calls:
remote_bash({
  command: "ls -la",
  cwd: "/var/www/myapp"  // Mapped from local path
})
```

### Custom Tmux Socket

If you want to use a different tmux socket name:

```json
{
  "tmux": {
    "socketName": "my-custom-socket"
  }
}
```

### Multiple Remotes

You can configure multiple remotes and switch between them:

```json
{
  "remotes": {
    "prod": { "host": "prod.example.com", ... },
    "staging": { "host": "staging.example.com", ... },
    "dev": { "host": "dev.example.com", ... }
  }
}
```

Then:
```
Connect to staging
[do some work]
Disconnect
Connect to prod
[do different work]
```

## Development

### Watch Mode

For development with auto-recompile:

```bash
npm run dev
```

### Debug Logging

Enable debug logging:

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/path/to/remote-command/dist/index.js"],
      "env": {
        "LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

Logs go to stderr, which Claude Code captures.

### Testing MCP Server Manually

You can test the MCP server with stdin/stdout:

```bash
node dist/index.js
# Then send JSON-RPC requests via stdin
```

Or use the MCP inspector tool if available.

## Security Considerations

1. **SSH Keys:** Never commit private keys to version control
2. **Config Files:** Add `config/remotes.json` to `.gitignore`
3. **Permissions:** Ensure SSH key files have correct permissions (600)
4. **Firewall:** Ensure remote host allows SSH connections from your IP
5. **Sudo:** Commands requiring sudo will prompt on remote - ensure proper sudo configuration

## Next Steps

1. Configure your remote hosts in `config/remotes.json`
2. Add MCP server to Claude Code settings
3. Restart Claude Code
4. Ask Claude Code: "Connect to my-server"
5. Start working with remote commands seamlessly!

## Support

For issues or questions:
- Check logs with `LOG_LEVEL=DEBUG`
- Review `ARCHITECTURE.md` for technical details
- Check `IMPLEMENTATION_STRATEGY.md` for design decisions
