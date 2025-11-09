# Troubleshooting: Nextcloud Server Connection

## Issue

Commands executed via `remote_bash` show:
- Docker not found
- Nextcloud containers not running
- Commands complete in ~4-5ms (too fast for remote)

But when SSHing directly to `root@192.168.10.238`, Docker and containers are present.

## Root Cause

The MCP server was **not connected** to the remote host before executing commands. Commands were likely running locally or in a disconnected state.

## Solution

### Step 1: Connect to the Remote Server

In OpenCode/Claude interface, explicitly connect first:

```
Connect to root@192.168.10.238
```

Or if using password authentication:
```
Connect to root@192.168.10.238 with password
```

This will:
1. Establish SSH connection
2. Set up tmux session on remote host
3. Configure environment (PATH, etc.)

### Step 2: Verify Connection

Check connection status:
```
What's the remote connection status?
```

This should show:
```
Status: Connected
Host: root@192.168.10.238
System Info: ...
```

### Step 3: Verify Docker Access

Once connected, verify Docker is accessible:
```
Run: docker ps
```

Should now show:
```
CONTAINER ID   IMAGE                                  COMMAND    ...
f47c1733c48f   lscr.io/linuxserver/nextcloud:latest   "/init"    ...
2f5dada2a196   postgres:15                            "docker-..." ...
```

### Step 4: Find Docker Compose Files

```
Run: find /root -name "*compose*.yml" -o -name "*compose*.yaml" 2>/dev/null
```

## Debug Checklist

- [ ] Run `remote_connect` before any `remote_bash` commands
- [ ] Verify connection with `remote_status`
- [ ] Check that commands take reasonable time (not 4-5ms)
- [ ] Verify Docker is accessible after connection
- [ ] Check SSH key permissions: `chmod 600 ~/.ssh/id_rsa`

## MCP Server Connection Flow

```
1. Start MCP Server (automatic via OpenCode)
   └─> Server starts but NO connection established

2. User: "Connect to root@192.168.10.238"
   └─> Calls remote_connect tool
   └─> Establishes SSH connection
   └─> Sets up tmux session on remote
   └─> Returns system info

3. User: "Run docker ps"
   └─> Calls remote_bash tool
   └─> Executes on connected remote host
   └─> Returns real output from remote

Without step 2, step 3 fails or runs locally!
```

## Environment Path Issue

If Docker is installed but not in PATH when running via SSH non-interactive shell:

### Check Docker Location
```bash
which docker  # Direct SSH: /usr/bin/docker
```

### Fix PATH in Remote Session

The MCP server should use login shell to inherit proper PATH. Check `session.ts` bootstrap:

```typescript
// Should source profile to get full PATH
tmux -CC -L ${socketName} new-session -s main bash --login
```

## Common Mistakes

1. **Not connecting before running commands**
   ```
   ❌ "Run docker ps"  # No connection established
   ✅ "Connect to root@192.168.10.238, then run docker ps"
   ```

2. **Assuming connection persists across OpenCode restarts**
   - Connection is session-based
   - Must reconnect after OpenCode restart

3. **Wrong host/config**
   - Verify: `remote_status` shows correct host
   - Check: `/home/user/remote-command/config/remotes.json`

## Next Steps

1. Update session initialization to always source `.bashrc`/`.bash_profile`
2. Add connection state persistence
3. Add auto-reconnect on command failure
4. Better error messages when not connected
