# Command Approval Mode - Warp-Style Flow

## How It Works (Like Warp Terminal)

**Approval Mode OFF** (default): Commands execute immediately
**Approval Mode ON**: Each command pauses and waits for approval - **ONE AT A TIME**, no queue

## Quick Start

### Enable Approval Mode by Default

```json
{
  "mcp": {
    "remote-command": {
      "type": "local",
      "command": [
        "env",
        "APPROVAL_MODE=true",
        "node",
        "/path/to/remote-command/dist/index.js"
      ]
    }
  }
}
```

## The Approval Flow

### Example 1: With Approval Mode ON

```
User: "Check disk space on the server"

AI: Calls remote_bash "df -h"
    → Returns: ⏸️  Command requires approval: df -h [cmd-1]

AI: "I want to run 'df -h' to check disk space. Should I proceed?"

User: "yes"

AI: Calls remote_approve cmd-1
    → Executes command and returns:
    ✓ Command approved and executed: df -h

    Filesystem      Size  Used Avail Use% Mounted on
    /dev/sda1       100G   45G   55G  45% /

AI: "The server has 100GB total, 45GB used, 55GB available."
```

### Example 2: With Approval Mode OFF

```
User: "Check disk space on the server"

AI: Calls remote_bash "df -h"
    → Executes immediately and returns output

AI: "The server has 100GB total, 45GB used, 55GB available."
```

## Key Features

✅ **Non-blocking** - AI gets immediate response when approval needed
✅ **One at a time** - No queue, current command pauses until approved/denied
✅ **Interactive** - AI prompts you naturally for approval
✅ **Warp-like UX** - Same flow as Warp terminal's command approval

## Commands

### Toggle Approval Mode

```
remote_approval_mode { enabled: true }   # Turn ON
remote_approval_mode { enabled: false }  # Turn OFF
```

### Approve a Command

```
remote_approve { command_id: "cmd-1" }
```

Returns the command output immediately after execution.

### Deny a Command

```
remote_deny { command_id: "cmd-1" }
```

Cancels the command.

### List Pending

```
remote_list_pending
```

Shows any commands waiting for approval (usually just one).

### Refine a Command

```
remote_refine {
  command_id: "cmd-1",
  new_command: "df -h /"
}
```

Replaces the pending command with a refined version.

## Conversation Examples

### Natural Approval Flow

```
User: "Enable approval mode"
AI: ✓ Approval mode enabled

User: "Delete all tmp files"
AI: I want to run 'rm -rf /tmp/*' - this will delete all files in /tmp.
    Should I proceed? (Approve/Deny/Refine)

User: "Refine it to only delete .log files"
AI: Updated command to: find /tmp -name "*.log" -delete
    Should I run this instead? (Approve/Deny)

User: "approve"
AI: [Executes and shows results]
```

### Batch Deny

```
User: "Show pending commands"
AI: [Lists 3 pending commands]

User: "Deny all of them"
AI: ✓ Denied 3 pending commands. All have been cancelled.
```

## Environment Variables

| Variable | Values | Effect |
|----------|--------|--------|
| `APPROVAL_MODE` | `true`, `1`, `on` | Start with approval ON |
| `APPROVAL_MODE` | `false`, `0`, `off`, unset | Start with approval OFF |

## Comparison with Warp Terminal

| Feature | Warp | This MCP |
|---------|------|----------|
| Toggle approval | Warp Settings → Auto-approve | `remote_approval_mode` |
| Command pauses | ✅ Modal popup | ✅ Returns "needs approval" |
| Approve | Click "Run" | `remote_approve cmd-1` |
| Deny | Click "Cancel" | `remote_deny cmd-1` |
| Edit before run | Edit in modal | `remote_refine` |
| Queue | One at a time | One at a time |

## Best Practices

**When to use approval mode:**
- Running commands on production servers
- Executing destructive operations (rm, DROP, etc.)
- Working with sudo/root privileges
- Testing new automation scripts
- When you want to review every command

**When to disable it:**
- Development/test environments
- Routine read-only operations
- Trusted AI-generated commands
- Batch operations where you trust the pattern

## Implementation Notes

This approval system is **non-blocking**:
1. `remote_bash` returns immediately with "needs approval" status
2. Command is stored with unique ID
3. `remote_approve` executes the stored command and returns output
4. No waiting, no timeouts, no hanging tool calls

Just like Warp terminal - simple, fast, interactive.
