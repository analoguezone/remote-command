# Command Approval Mode - Quick Reference

## Environment Variable Control

### Enable Approval Mode by Default

Add to your OpenCode config:

```json
{
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": [
        "env",
        "APPROVAL_MODE=true",
        "LOG_LEVEL=DEBUG",
        "node",
        "/path/to/remote-command/dist/index.js"
      ]
    }
  }
}
```

**Environment Variables:**
- `APPROVAL_MODE=true` - Start with approval mode ON
- `APPROVAL_MODE=false` or unset - Start with approval mode OFF (default)

## Quick Commands for Users

### Toggle Approval Mode

**Turn ON:**
```
approval on
```

**Turn OFF:**
```
approval off
```

### Manage Pending Commands

**List pending:**
```
pending
```

**Approve command:**
```
approve cmd-1
```

**Deny command:**
```
deny cmd-1
```

**Approve all:**
```
approve all
```

**Refine command:**
```
refine cmd-1 to <new command>
```

## Streamlined Workflow

When approval mode is ON:

1. User: "check disk space"
2. AI attempts to run `df -h`
3. Command gets queued, AI immediately sees it needs approval
4. AI tells user: "Command requires approval: df -h. Approve?"
5. User: "yes" or "approve"
6. AI approves and command executes

## Key Shortcuts (for OpenCode users)

While OpenCode doesn't support direct keyboard shortcuts in MCP, you can use short commands:

- `y` or `yes` or `approve` - Approve the most recent pending command
- `n` or `no` or `deny` - Deny the most recent pending command
- `pending` - Show what's waiting

## Best Practices

**Use approval mode when:**
- Working on production servers
- Running destructive commands (rm, DROP, etc.)
- Executing commands with sudo/root
- Testing new automation scripts

**Disable approval mode when:**
- Running safe read-only commands
- Doing repetitive tasks
- Working on dev/test environments
- You trust the AI agent completely

## Advanced: Per-Session Toggle

You can toggle approval mode on/off during a session:

```
User: "Turn on approval mode"
AI: ✓ Approval mode enabled

User: "Delete old logs"
AI: Command requires approval: find /var/log -mtime +30 -delete
    Approve? (yes/no/refine)

User: "yes"
AI: Executing... [shows output]

User: "Turn off approval mode"
AI: ✓ Approval mode disabled
    (remaining commands will execute immediately)
```
