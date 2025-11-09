# Ad-Hoc Remote Connections

One of the key features of Remote Command MCP Server is the ability to connect to **any remote host on-the-fly** without pre-configuration. You can connect and disconnect to different servers seamlessly within your conversation with Claude Code.

## Why Ad-Hoc Connections?

- **Flexibility**: Connect to any server instantly without editing config files
- **No Pre-Configuration**: Don't need to add hosts to `config/remotes.json` beforehand
- **Multi-Server Workflows**: Easily switch between servers in the same session
- **Quick Debugging**: Jump onto any server for quick investigations
- **Better UX**: Natural conversation flow without leaving the chat

## Connection Methods

### Method 1: Simple hostname/IP with current user

```
Connect to 192.168.1.100
```

Claude Code will connect using:
- Host: `192.168.1.100`
- User: Current system user (`$USER`)
- Port: `22` (default)
- Key: Auto-detect from `~/.ssh/` (tries id_rsa, id_ed25519, id_ecdsa)

### Method 2: User@Host format

```
Connect to ubuntu@server.example.com
```

Claude Code will connect using:
- Host: `server.example.com`
- User: `ubuntu`
- Port: `22` (default)
- Key: Auto-detect from `~/.ssh/`

### Method 3: User@Host:Port format

```
Connect to root@192.168.1.100:2222
```

Claude Code will connect using:
- Host: `192.168.1.100`
- User: `root`
- Port: `2222`
- Key: Auto-detect from `~/.ssh/`

### Method 4: With specific SSH key

```
Connect to deploy@staging.example.com using SSH key ~/.ssh/staging_key
```

Claude Code will connect using:
- Host: `staging.example.com`
- User: `deploy`
- Port: `22` (default)
- Key: `~/.ssh/staging_key`

### Method 5: With custom port and key

```
Connect to admin@server.com on port 2222 using key ~/.ssh/admin_key
```

Claude Code will connect using:
- Host: `server.com`
- User: `admin`
- Port: `2222`
- Key: `~/.ssh/admin_key`

### Method 6: Password authentication (less secure)

```
Connect to user@oldserver.com with password "mypassword"
```

Claude Code will connect using:
- Host: `oldserver.com`
- User: `user`
- Port: `22` (default)
- Password: `mypassword`

**Note:** Password auth is less secure than key-based authentication. Use only when necessary.

### Method 7: Using pre-configured host (optional)

If you have hosts configured in `config/remotes.json`:

```
Connect to production
```

This uses the settings from your config file. Config is purely optional for convenience.

## Real-World Examples

### Scenario 1: Quick Server Investigation

**You:** "Connect to ubuntu@10.0.1.50 and check why the API is slow"

**Claude Code:**
1. Connects to `ubuntu@10.0.1.50`
2. Checks CPU: `top -bn1`
3. Checks memory: `free -h`
4. Checks processes: `ps aux | grep api`
5. Analyzes and suggests fixes

### Scenario 2: Multi-Server Debugging

**You:** "Connect to web@frontend-1.example.com and check nginx logs"

**Claude Code:**
- Connects and checks `/var/log/nginx/error.log`

**You:** "Now disconnect and connect to backend@api-server.example.com and check the database connection"

**Claude Code:**
- Disconnects from frontend
- Connects to backend server
- Checks database connectivity

### Scenario 3: Emergency Access

**You:** "Quick! Connect to root@prod-db.example.com on port 2200 using key ~/.ssh/emergency and check disk space"

**Claude Code:**
- Immediately connects with specified parameters
- Runs `df -h` to check disk space
- Provides analysis

### Scenario 4: Testing Multiple Environments

**You:**
```
1. Connect to staging-server.com and run the deployment test
2. Then connect to qa-server.com and run the same test
3. Compare the results
```

**Claude Code:**
- Connects to staging, runs tests, saves output
- Disconnects
- Connects to QA, runs tests
- Compares and analyzes differences

## Connection Parameters Summary

When Claude Code calls the `remote_connect` tool, it can use these parameters:

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `host` | string | ✅ Yes | Hostname, IP, or config name | `"192.168.1.100"`, `"ubuntu@server.com"`, `"production"` |
| `user` | string | ❌ No | SSH username | `"ubuntu"`, `"root"`, `"deploy"` |
| `port` | number | ❌ No | SSH port | `22`, `2222`, `2200` |
| `identity_file` | string | ❌ No | Path to SSH private key | `"~/.ssh/id_rsa"`, `"/home/user/.ssh/mykey"` |
| `password` | string | ❌ No | Password for auth (less secure) | `"mypassword"` |

## Behind the Scenes

When you say: **"Connect to ubuntu@192.168.1.100 on port 2222 using key ~/.ssh/mykey"**

Claude Code understands and calls:
```javascript
remote_connect({
  host: "ubuntu@192.168.1.100",
  port: 2222,
  identity_file: "~/.ssh/mykey"
})
```

Or more explicitly:
```javascript
remote_connect({
  host: "192.168.1.100",
  user: "ubuntu",
  port: 2222,
  identity_file: "~/.ssh/mykey"
})
```

Both work! Claude is smart enough to parse your intent.

## Auto-Detection Features

### SSH Key Auto-Detection

If you don't specify a key, the system automatically tries:
1. `~/.ssh/id_rsa`
2. `~/.ssh/id_ed25519`
3. `~/.ssh/id_ecdsa`

Whichever exists first is used.

### User Auto-Detection

If you don't specify a user:
- Uses the current system user (`$USER` environment variable)
- Or defaults to `root` if `$USER` is not set

### Port Auto-Detection

If you don't specify a port:
- Defaults to `22` (standard SSH port)

## Session Management

### One Connection at a Time

The system maintains one active connection at a time. If you're already connected:

**You:** "Connect to another-server.com"

**Claude Code:** "Already connected to a remote host. Disconnect first."

### Explicit Disconnect

**You:** "Disconnect from the server"

**Claude Code:** Disconnects cleanly, closes tmux session, terminates SSH.

### Reconnect Workflow

```
You: Connect to server-1.com
[work on server-1]

You: Disconnect and connect to server-2.com
[Claude disconnects from server-1, then connects to server-2]

You: Disconnect and connect back to server-1.com
[Claude disconnects from server-2, reconnects to server-1]
```

## Benefits Over Traditional Approaches

| Traditional SSH | Remote Command MCP |
|----------------|-------------------|
| Manual SSH in separate terminal | Seamless in-chat connection |
| Copy/paste commands | Claude executes and analyzes |
| Switch windows to see output | Everything in one conversation |
| Pre-configure every host | Connect to any host instantly |
| Manual reconnection | Simple "connect to X" command |

## Security Considerations

### Best Practices

1. **Prefer Key-Based Auth**: Always use SSH keys over passwords
2. **Key Permissions**: Ensure SSH keys have `600` permissions: `chmod 600 ~/.ssh/id_rsa`
3. **Config for Sensitive Hosts**: For production servers, use config files with restricted permissions
4. **Avoid Passwords in Chat**: Don't type passwords in the conversation (they're logged)
5. **Use SSH Agent**: Add keys to ssh-agent for passphrase-protected keys

### SSH Key Setup

If you haven't set up SSH keys:

```bash
# Generate a new key
ssh-generate-key -t ed25519 -C "your@email.com"

# Copy to remote server
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host

# Test connection
ssh -i ~/.ssh/id_ed25519 user@host
```

Once working, you can use it with Claude Code:

```
Connect to user@host using key ~/.ssh/id_ed25519
```

## Tips & Tricks

### Quick Status Check

**You:** "What server am I connected to?"

**Claude Code:** Shows current connection status, uptime, system info.

### Rapid Server Hopping

**You:** "I need to check logs on all 3 app servers: app1.com, app2.com, app3.com"

**Claude Code:** Will sequentially:
1. Connect to app1.com
2. Check logs
3. Disconnect
4. Connect to app2.com
5. Check logs
6. Disconnect
7. Connect to app3.com
8. Check logs
9. Provide consolidated report

### Context Preservation

Claude remembers what you're doing across connections:

**You:** "Connect to server1 and check if PostgreSQL is running"
[Claude checks, finds it's running on port 5432]

**You:** "Disconnect and connect to server2, check the same thing"
[Claude knows to check for PostgreSQL on the new server]

## Troubleshooting

### "Permission denied (publickey)"

Your SSH key isn't authorized on the remote server.

**Solution:**
```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub user@host
```

### "Connection timeout"

Host is unreachable or SSH port is blocked.

**Solution:**
- Verify host is online: `ping host`
- Check correct port: `nmap -p 22 host`
- Check firewall rules

### "Failed to read SSH key"

Key file doesn't exist or has wrong permissions.

**Solution:**
```bash
chmod 600 ~/.ssh/id_rsa
ls -la ~/.ssh/id_rsa  # Verify it exists
```

### "No SSH key found and no password provided"

No default SSH key detected.

**Solution:**
- Specify key explicitly: "Connect to user@host using key ~/.ssh/mykey"
- Or generate a key: `ssh-keygen -t ed25519`

## Comparison: Config vs Ad-Hoc

### When to Use Config (`config/remotes.json`)

✅ Production servers you access frequently
✅ Servers with complex path mappings
✅ Servers requiring specific tmux settings
✅ Team environments (share config via git)
✅ Consistent naming ("production", "staging", etc.)

### When to Use Ad-Hoc Connections

✅ One-time server access
✅ Quick debugging sessions
✅ Testing new servers
✅ Customer servers
✅ Dynamic/temporary servers
✅ Emergency access

### You Can Use Both!

```json
{
  "remotes": {
    "production": { "host": "prod.example.com", ... },
    "staging": { "host": "staging.example.com", ... }
  }
}
```

Then in conversation:

```
Connect to production  ← Uses config
[do work]
Disconnect
Connect to ubuntu@customer-temp.com  ← Ad-hoc
[do work]
Disconnect
Connect to staging  ← Uses config again
```

## Summary

**You can connect to ANY server, ANYTIME, without leaving your conversation with Claude Code.**

No configuration files needed (though they're available for convenience). Just tell Claude where to connect, and it handles the rest - SSH connection, tmux setup, command execution, output streaming, everything.

This is the flexibility Warp's warpify provides, but integrated directly into Claude Code's natural language interface.
