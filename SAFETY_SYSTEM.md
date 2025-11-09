# Command Safety System

The MCP server now includes a comprehensive safety system to prevent accidental execution of dangerous commands.

## Safety Modes

Set the `SAFETY_MODE` environment variable in your MCP configuration:

### 1. **Interactive** (DEFAULT)
- Safe commands execute immediately
- Modify commands execute immediately
- Dangerous commands require explicit user approval

### 2. **Read-only**
- Only safe (read-only) commands allowed
- All modify/dangerous commands blocked

### 3. **Unrestricted**
- Original behavior - no restrictions
- **Not recommended** for production use

## Configuration

Edit your OpenCode MCP config:

```json
{
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": ["node", "/path/to/remote-command/dist/index.js"],
      "enabled": true,
      "environment": {
        "SAFETY_MODE": "interactive",  // or "read-only" or "unrestricted"
        "LOG_LEVEL": "DEBUG",
        "LOG_FILE": "/tmp/remote-command-mcp.log"
      }
    }
  }
}
```

## How Approval Works

### Example Workflow:

1. **AI tries to run dangerous command:**
   ```
   User: "Enable the firewall"
   AI: Calls remote_bash with "ufw enable"
   ```

2. **System blocks and requests approval:**
   ```
   ⚠️ DANGEROUS COMMAND - Approval Required

   Command: ufw enable
   Classification: dangerous
   Reason: Contains dangerous operation

   Approval ID: abc123xyz
   Challenge Code: XY7Z9K
   Expires in: 60 seconds

   User should respond with:
   "Execute with challenge code: XY7Z9K"
   ```

3. **User provides challenge code:**
   ```
   User: "Execute with challenge code: XY7Z9K"
   ```

4. **AI calls remote_approve:**
   ```
   AI: Calls remote_approve with:
   - approval_id: abc123xyz
   - challenge: XY7Z9K
   ```

5. **Command executes:**
   ```
   ✅ Command Approved and Executed

   Command: ufw enable
   [output...]
   ```

## Command Classifications

### Safe (Always Allowed)
- Read-only operations: `ls`, `cat`, `grep`, `ps`, `netstat`, `df`, etc.
- Status checks: `systemctl status`, `git status`, `docker ps`, etc.

### Modify (Interactive Mode Only)
- File operations: `touch`, `mkdir`, `cp`, `mv`
- Permissions: `chmod`, `chown`
- Archives: `tar`, `zip`, `gzip`

### Dangerous (Requires Approval)
- Package management: `apt install/remove`, `yum`, `dnf`
- System services: `systemctl start/stop/restart`
- Firewall: `ufw`, `iptables`
- User management: `useradd`, `userdel`, `passwd`
- Destructive: `rm -rf`, `mkfs`, `dd`
- System control: `reboot`, `shutdown`

## Security Features

### Random Challenge Codes
- Prevents AI from auto-approving commands
- User must explicitly provide the code
- Codes are randomly generated and unique

### Time-Limited Approvals
- Approvals expire after 60 seconds
- Must request new approval if expired
- Prevents stale approvals from being used

### Audit Logging
- All dangerous command attempts logged
- Approval grants/denials logged
- Check `/tmp/remote-command-mcp.log`

## Testing the System

### Test 1: Safe Command (should work immediately)
```
User: "List files in /tmp"
AI: Calls remote_bash with "ls /tmp"
✅ Executes immediately
```

### Test 2: Dangerous Command (requires approval)
```
User: "Restart nginx"
AI: Calls remote_bash with "systemctl restart nginx"
⚠️ Requires approval
User: "Execute with challenge code: ABC123"
AI: Calls remote_approve
✅ Executes after approval
```

### Test 3: Check Safety Mode
```
User: "What's the safety status?"
AI: Calls remote_status
Shows: Safety Mode: interactive
```

## Recommendations

### For Development
```json
"SAFETY_MODE": "interactive"
```
- Allows AI to help with most tasks
- Requires approval for risky operations
- Good balance of safety and productivity

### For Production
```json
"SAFETY_MODE": "read-only"
```
- Maximum safety
- Only monitoring/status commands
- No system modifications allowed

### For Experimentation (⚠️ Use with caution)
```json
"SAFETY_MODE": "unrestricted"
```
- No safety checks
- AI has full control
- Only use in isolated test environments

## Disabling the Safety System

If you need the old behavior (not recommended):

```json
"environment": {
  "SAFETY_MODE": "unrestricted"
}
```

## Troubleshooting

### "Approval Failed" errors
- Check challenge code is correct (case-sensitive)
- Check approval hasn't expired (60s limit)
- Request new approval if needed

### Commands blocked in read-only mode
- Change to `"SAFETY_MODE": "interactive"`
- Or use `"SAFETY_MODE": "unrestricted"` (not recommended)

### AI not asking for approval
- Check SAFETY_MODE is set correctly
- Check logs: `/tmp/remote-command-mcp.log`
- Restart OpenCode after config changes
