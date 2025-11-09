# Quick Start Guide

Get up and running with Remote Command MCP Server in 5 minutes.

## Prerequisites

- Node.js >= 18
- Claude Code installed
- SSH access to a remote server with key authentication
- Tmux >= 2.9 on remote server

## 5-Minute Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure Remote

Create `config/remotes.json`:

```json
{
  "version": "1.0",
  "remotes": {
    "myserver": {
      "host": "your-server.com",
      "user": "ubuntu",
      "identityFile": "~/.ssh/id_rsa"
    }
  }
}
```

### 4. Add to Claude Code

Get the absolute path:

```bash
pwd
# Copy this path
```

Add to Claude Code settings (`~/.config/claude-code/settings.json`):

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/absolute/path/from/pwd/dist/index.js"]
    }
  }
}
```

### 5. Restart Claude Code & Test

Restart Claude Code, then ask:

```
Connect to myserver
```

Then:

```
Run 'uname -a' to show system info
```

## What You Can Do

Once connected, ask Claude Code to:

- **Check system resources:** "What's the CPU and memory usage?"
- **Investigate issues:** "Check why Docker container X keeps restarting"
- **Deploy code:** "Pull latest from git and restart the service"
- **View logs:** "Show me the last 50 lines of /var/log/nginx/error.log"
- **Debug networking:** "Check if port 8080 is listening and what process is using it"

Claude Code will automatically:
1. Execute appropriate commands
2. Stream output in real-time
3. Analyze results
4. Execute follow-up commands as needed

## Example Sessions

### Debugging a Service

**You:** "My Node.js app on port 3000 isn't responding. Help me debug it."

**Claude Code will:**
1. Check if process is running: `ps aux | grep node`
2. Check port: `netstat -tlnp | grep 3000`
3. Check logs: `journalctl -u myapp -n 50`
4. Check system resources: `top -bn1 | head -20`
5. Analyze and suggest fixes

### Deploying Updates

**You:** "Deploy the latest changes from the main branch"

**Claude Code will:**
1. Navigate to project: `cd /var/www/myapp`
2. Pull changes: `git pull origin main`
3. Install deps: `npm install`
4. Restart service: `sudo systemctl restart myapp`
5. Verify: `systemctl status myapp`

### System Monitoring

**You:** "Give me a system health check"

**Claude Code will:**
1. Check disk: `df -h`
2. Check memory: `free -h`
3. Check CPU: `uptime`
4. Check services: `systemctl list-units --failed`
5. Provide summary report

## Commands Cheat Sheet

| What You Say | What Happens |
|-------------|--------------|
| "Connect to myserver" | Connects via SSH + tmux |
| "Run command X" | Executes X on remote |
| "Disconnect" | Closes remote connection |
| "Connection status?" | Shows current status |
| "Check Docker containers" | Runs `docker ps -a` |
| "View logs in /var/log/X" | Runs `tail -f /var/log/X` |

## Troubleshooting

### Can't connect?

```bash
# Test SSH manually
ssh -i ~/.ssh/id_rsa ubuntu@your-server.com

# Check tmux on remote
ssh ubuntu@your-server.com "tmux -V"
```

### MCP not showing up?

1. Check absolute path is correct
2. Verify build: `ls dist/index.js`
3. Restart Claude Code completely

### Commands timing out?

Increase timeout in tool call or check remote host performance.

## Next Steps

- Read [SETUP.md](./SETUP.md) for detailed configuration
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Configure multiple remotes
- Set up path mappings for your projects

## Tips

1. **Stay Connected:** Keep connection open for faster command execution
2. **Use Config Names:** "Connect to production" instead of "Connect to user@host"
3. **Let Claude Decide:** Just describe the problem, let Claude figure out the commands
4. **Multiple Commands:** Claude will automatically sequence related commands

---

**That's it!** You're now set up to use Claude Code seamlessly with remote servers.
