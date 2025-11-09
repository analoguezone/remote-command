# Quick Start Guide

Get up and running with Remote Command MCP Server in 5 minutes.

## Prerequisites

- Node.js >= 18
- OpenCode installed
- SSH access to a remote server with key authentication
- Tmux >= 2.9 on remote server (will be checked automatically)

## 5-Minute Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure Remote (Optional)

**You can skip this step!** The system supports ad-hoc connections to any server.

But if you want, create `config/remotes.json` for frequently used servers:

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

### 4. Add to OpenCode

Get the absolute path:

```bash
pwd
# Copy this path
```

Add to your `opencode.json` configuration file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["node", "/absolute/path/from/pwd/dist/index.js"],
      "enabled": true
    }
  }
}
```

Replace `/absolute/path/from/pwd` with the actual path from the `pwd` command above.

### 5. Restart OpenCode & Test

Restart OpenCode, then try connecting to any server:

**Option 1: Ad-hoc connection** (no config needed)
```
Connect to ubuntu@your-server.com
```

**Option 2: Using config** (if you created config/remotes.json)
```
Connect to myserver
```

Then test a command:
```
Run 'uname -a' to show system info
```

## What You Can Do

Once connected, ask OpenCode to:

- **Check system resources:** "What's the CPU and memory usage?"
- **Investigate issues:** "Check why Docker container X keeps restarting"
- **Deploy code:** "Pull latest from git and restart the service"
- **View logs:** "Show me the last 50 lines of /var/log/nginx/error.log"
- **Debug networking:** "Check if port 8080 is listening and what process is using it"

OpenCode will automatically:
1. Execute appropriate commands
2. Stream output in real-time
3. Analyze results
4. Execute follow-up commands as needed

## Example Sessions

### Debugging a Service

**You:** "My Node.js app on port 3000 isn't responding. Help me debug it."

**OpenCode will:**
1. Check if process is running: `ps aux | grep node`
2. Check port: `netstat -tlnp | grep 3000`
3. Check logs: `journalctl -u myapp -n 50`
4. Check system resources: `top -bn1 | head -20`
5. Analyze and suggest fixes

### Deploying Updates

**You:** "Deploy the latest changes from the main branch"

**OpenCode will:**
1. Navigate to project: `cd /var/www/myapp`
2. Pull changes: `git pull origin main`
3. Install deps: `npm install`
4. Restart service: `sudo systemctl restart myapp`
5. Verify: `systemctl status myapp`

### System Monitoring

**You:** "Give me a system health check"

**OpenCode will:**
1. Check disk: `df -h`
2. Check memory: `free -h`
3. Check CPU: `uptime`
4. Check services: `systemctl list-units --failed`
5. Provide summary report

## Commands Cheat Sheet

| What You Say | What Happens |
|-------------|--------------|
| "Connect to ubuntu@192.168.1.100" | Ad-hoc connection via SSH + tmux |
| "Connect to myserver" | Uses pre-configured host |
| "Connect to root@server.com on port 2222" | Custom port connection |
| "Run command X" | Executes X on remote |
| "Disconnect" | Closes remote connection |
| "Connection status?" | Shows current status |
| "Check Docker containers" | Runs `docker ps -a` |
| "View logs in /var/log/X" | Runs appropriate tail command |

## Troubleshooting

### Can't connect?

```bash
# Test SSH manually
ssh -i ~/.ssh/id_rsa ubuntu@your-server.com

# Check tmux on remote
ssh ubuntu@your-server.com "tmux -V"
```

### MCP not showing up?

1. Check absolute path is correct in `opencode.json`
2. Verify `"enabled": true` is set
3. Verify build: `ls dist/index.js`
4. Check `opencode.json` JSON syntax is valid
5. Restart OpenCode completely

### Commands timing out?

1. Increase timeout in `opencode.json`: `"timeout": 30000` (30 seconds)
2. Check remote host performance
3. Enable debug logging: `"LOG_LEVEL": "DEBUG"` in environment

## Next Steps

- Read [SETUP.md](./SETUP.md) for detailed configuration
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- Read [AD_HOC_CONNECTIONS.md](./AD_HOC_CONNECTIONS.md) for connection examples
- Configure multiple remotes (optional)
- Set up path mappings for your projects (optional)

## Tips

1. **Stay Connected:** Keep connection open for faster command execution
2. **Use Config Names:** "Connect to production" instead of typing full host details
3. **Let OpenCode Decide:** Just describe the problem, let OpenCode figure out the commands
4. **Multiple Commands:** OpenCode will automatically sequence related commands
5. **No Config Required:** You can connect to any server without pre-configuration

---

**That's it!** You're now set up to use OpenCode seamlessly with remote servers.
