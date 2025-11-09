# FIX: Nextcloud Server Connection Issues

## ROOT CAUSE IDENTIFIED

### Issue 1: No Active Connection
Commands are executing without first establishing a connection to `root@192.168.10.238`. This causes commands to either:
- Run in a local/default context (explaining missing Docker)
- Fail silently
- Complete in ~4-5ms (too fast for remote execution)

### Issue 2: Non-Login Shell (Secondary Issue)
Even after connecting, the tmux session uses a non-login shell which may not have full PATH.

**Location:** `src/remote/session.ts:380`
```typescript
stream.write('new-window -P -F "#{pane_id}" bash\n');
```

This should be:
```typescript
stream.write('new-window -P -F "#{pane_id}" bash --login\n');
```

A non-login shell doesn't source `/etc/profile`, `~/.bash_profile`, or `~/.profile`, which may contain PATH updates.

## IMMEDIATE FIX (For User)

### Step 1: Connect First

In the chat interface where you're running commands, you MUST first connect:

```
Connect to root@192.168.10.238
```

This will:
1. Establish SSH connection
2. Bootstrap tmux on remote
3. Set up command execution environment
4. Return system info

### Step 2: Verify Connection

```
Check remote status
```

Expected output:
```
Status: Connected
Host: root@192.168.10.238
System Info: {...}
```

### Step 3: Now Run Commands

```
Run docker ps
```

Should now show your containers:
```
CONTAINER ID   IMAGE                                  COMMAND    ...
f47c1733c48f   lscr.io/linuxserver/nextcloud:latest   "/init"    ...
2f5dada2a196   postgres:15                            "docker-..." ...
```

### Step 4: Find Docker Compose Files

```
Run: find /root -name "docker-compose.yml" -o -name "docker-compose.yaml" -type f
```

## PERMANENT FIX (Code Changes)

### Fix 1: Use Login Shell

**File:** `src/remote/session.ts`
**Line:** 380

```typescript
// Before
stream.write('new-window -P -F "#{pane_id}" bash\n');

// After
stream.write('new-window -P -F "#{pane_id}" bash --login\n');
```

This ensures the shell sources all profile files and has full PATH.

### Fix 2: Add Connection State Warning

When `remote_bash` is called without connection, enhance the error message:

**File:** `src/mcp/server.ts`
**Line:** 287-297

```typescript
private async handleBash(args: { command: string; timeout?: number; cwd?: string }) {
  if (!this.session.isConnected()) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Not connected to any remote host.

Please connect first using one of:
- "Connect to root@192.168.10.238"
- "Connect to ubuntu@192.168.1.100"
- "Connect to production" (if configured)

Then try your command again.`
        }
      ],
      isError: true
    };
  }
  // ... rest of code
}
```

### Fix 3: Source Environment Explicitly

Add explicit environment sourcing in the pane creation:

**File:** `src/remote/session.ts`
**Line:** 380

```typescript
// Option A: Use login shell
stream.write('new-window -P -F "#{pane_id}" bash --login\n');

// Option B: Explicit sourcing (more reliable)
stream.write('new-window -P -F "#{pane_id}" bash -c "source /etc/profile 2>/dev/null; source ~/.bash_profile 2>/dev/null || source ~/.profile 2>/dev/null; source ~/.bashrc 2>/dev/null; exec bash"\n');
```

## IMPLEMENTATION PLAN

1. **Immediate User Action** (Manual - Do Now):
   - User must connect to server before running commands
   - Update chat prompts to include connection step

2. **Code Fix** (Development - Next):
   - Update session.ts to use login shell
   - Improve error messages
   - Test PATH inheritance

3. **Long-term Enhancement** (Future):
   - Add connection persistence
   - Auto-reconnect on command failure
   - Connection state indicator in responses

## WHY THIS HAPPENED

1. **MCP Architecture**: The MCP server is stateful - it maintains ONE connection at a time
2. **No Auto-Connect**: The server doesn't auto-connect; user must explicitly connect
3. **Misleading Logs**: Commands appeared to execute (4-5ms completion) but were in wrong context

## VERIFICATION STEPS

After connecting, verify all these work:

```bash
# 1. Check Docker accessible
docker --version

# 2. Check containers running
docker ps

# 3. Check PATH includes /usr/bin
echo $PATH

# 4. Check we're on the right host
hostname  # Should return: nextcloud

# 5. Check we're root
whoami   # Should return: root
```

## TESTING THE FIX

After implementing the login shell change:

```typescript
// Test 1: Connect fresh
remote_connect({ host: "root@192.168.10.238" })

// Test 2: Verify PATH
remote_bash({ command: "echo $PATH" })
// Should include: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

// Test 3: Check Docker
remote_bash({ command: "which docker" })
// Should return: /usr/bin/docker

// Test 4: Profile sourced
remote_bash({ command: "echo $SHELL; shopt login_shell" })
// Should show login shell active
```

## SUMMARY

**Immediate Action**: User must run "Connect to root@192.168.10.238" before ANY commands

**Code Fix**: Change `bash` to `bash --login` in session.ts:380

**Root Cause**: Stateful MCP connection not established + non-login shell PATH issues
