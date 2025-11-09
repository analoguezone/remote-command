# Implementation Strategy

## Recommended Approach: MCP Server for Claude Code

The **best strategy** for integrating with Claude Code (opencode) is to build an **MCP (Model Context Protocol) Server**. This is the native extension mechanism for Claude Code.

## Why MCP Server?

1. **Official Integration Method**: MCP is Claude Code's designed extension protocol
2. **No Wrapper Hacks**: Clean integration without intercepting system calls
3. **Tool Registration**: Expose remote commands as tools Claude can call
4. **Bi-directional Communication**: Proper streaming and status updates
5. **Session Management**: Built-in connection lifecycle handling

## Architecture: MCP Server Approach

```
┌──────────────────────────────────────────────────┐
│            Claude Code (opencode)                │
│   - Reads MCP server config                      │
│   - Connects via stdio                           │
│   - Calls remote_bash tool                       │
└───────────────────┬──────────────────────────────┘
                    │ stdio (JSON-RPC)
                    │
┌───────────────────▼──────────────────────────────┐
│        Remote Command MCP Server                 │
│   Tools:                                         │
│   - remote_bash(command)                         │
│   - remote_connect(host)                         │
│   - remote_disconnect()                          │
│   - remote_status()                              │
└───────────────────┬──────────────────────────────┘
                    │ SSH
                    │
┌───────────────────▼──────────────────────────────┐
│          Remote Host + Tmux                      │
│   - Tmux control mode (-CC)                      │
│   - Executes commands                            │
│   - Streams output back                          │
└──────────────────────────────────────────────────┘
```

## Project Structure

```
remote-command/
├── src/
│   ├── mcp/
│   │   ├── server.ts              # MCP server implementation
│   │   ├── tools.ts               # Tool definitions
│   │   └── types.ts               # MCP protocol types
│   ├── remote/
│   │   ├── session.ts             # Remote session manager
│   │   ├── ssh-tunnel.ts          # SSH connection handling
│   │   ├── tmux-control.ts        # Tmux control mode parser
│   │   └── command-queue.ts       # Command queue manager
│   ├── utils/
│   │   ├── logger.ts              # Logging utilities
│   │   ├── config.ts              # Configuration management
│   │   └── escape-sequence.ts     # Escape sequence parser
│   ├── bootstrap/
│   │   ├── warpify.sh             # Remote bootstrap script
│   │   └── tmux-setup.sh          # Tmux installation helper
│   └── index.ts                   # Main entry point
├── config/
│   └── remotes.json               # Remote host configuration
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md
├── IMPLEMENTATION_STRATEGY.md
└── README.md
```

## MCP Server Tools

### 1. `remote_bash` Tool

Executes bash commands on the connected remote host.

```typescript
{
  name: "remote_bash",
  description: "Execute bash commands on the connected remote host",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute"
      },
      timeout: {
        type: "number",
        description: "Command timeout in milliseconds (default: 120000)"
      },
      cwd: {
        type: "string",
        description: "Working directory for command execution"
      }
    },
    required: ["command"]
  }
}
```

### 2. `remote_connect` Tool

Connects to a remote host.

```typescript
{
  name: "remote_connect",
  description: "Connect to a remote host for command execution",
  inputSchema: {
    type: "object",
    properties: {
      host: {
        type: "string",
        description: "Remote host to connect to (from config or user@host)"
      },
      identity_file: {
        type: "string",
        description: "SSH identity file path (optional)"
      }
    },
    required: ["host"]
  }
}
```

### 3. `remote_disconnect` Tool

Disconnects from the current remote host.

```typescript
{
  name: "remote_disconnect",
  description: "Disconnect from the currently connected remote host",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 4. `remote_status` Tool

Shows connection status and remote system info.

```typescript
{
  name: "remote_status",
  description: "Get current remote connection status",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

## Tmux Control Mode Integration

### Control Mode Flow

```bash
# 1. SSH into remote
ssh user@host

# 2. Start tmux in control mode
tmux -Lremote-cmd -CC

# 3. Tmux sends control messages
%begin 1699564800 0 0
# ... command output ...
%end 1699564800 0 0 0

# 4. We parse and stream back to Claude Code
```

### Parser Implementation

```typescript
class TmuxControlParser {
  private buffer: string = '';

  feed(data: string): ControlMessage[] {
    this.buffer += data;
    const messages: ControlMessage[] = [];

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const msg = this.parseLine(line);
      if (msg) messages.push(msg);
    }

    return messages;
  }

  private parseLine(line: string): ControlMessage | null {
    // %begin <time> <flags> <pane>
    if (line.startsWith('%begin ')) {
      const parts = line.split(' ');
      return {
        type: 'begin',
        timestamp: parseInt(parts[1]),
        flags: parseInt(parts[2]),
        pane: parseInt(parts[3])
      };
    }

    // %end <time> <flags> <pane> <exit-code>
    if (line.startsWith('%end ')) {
      const parts = line.split(' ');
      return {
        type: 'end',
        timestamp: parseInt(parts[1]),
        flags: parseInt(parts[2]),
        pane: parseInt(parts[3]),
        exitCode: parseInt(parts[4])
      };
    }

    // %output %<pane> <data>
    if (line.startsWith('%output ')) {
      const match = line.match(/^%output %(\d+) (.*)$/);
      if (match) {
        return {
          type: 'output',
          pane: parseInt(match[1]),
          data: Buffer.from(match[2], 'base64').toString('utf-8')
        };
      }
    }

    // Regular output (between %begin and %end)
    return {
      type: 'output',
      data: line
    };
  }
}
```

## SSH Connection Management

### Session Class

```typescript
class RemoteSession {
  private ssh: SSH2Client | null = null;
  private tmuxStream: NodeJS.ReadWriteStream | null = null;
  private parser: TmuxControlParser;
  private commandQueue: CommandQueue;

  async connect(host: string, options: SSHOptions): Promise<void> {
    this.ssh = new SSH2Client();

    await new Promise((resolve, reject) => {
      this.ssh!.on('ready', resolve);
      this.ssh!.on('error', reject);
      this.ssh!.connect({
        host: options.host,
        username: options.username,
        privateKey: fs.readFileSync(options.identityFile)
      });
    });

    // Bootstrap remote (install/check tmux)
    await this.bootstrap();

    // Start tmux control mode
    await this.startTmuxControl();
  }

  private async bootstrap(): Promise<void> {
    // Send warpify-like bootstrap script
    const script = fs.readFileSync('./src/bootstrap/warpify.sh', 'utf-8');
    const result = await this.execRaw(script);

    // Parse system details
    const systemInfo = JSON.parse(result.stdout);
    logger.info('Remote system:', systemInfo);
  }

  private async startTmuxControl(): Promise<void> {
    this.ssh!.shell((err, stream) => {
      if (err) throw err;

      this.tmuxStream = stream;

      // Start tmux control mode
      stream.write('tmux -Lremote-cmd -CC\n');

      // Set up parser
      stream.on('data', (data: Buffer) => {
        const messages = this.parser.feed(data.toString());
        this.handleControlMessages(messages);
      });
    });
  }

  async execute(command: string, options: ExecOptions): Promise<CommandResult> {
    return this.commandQueue.enqueue({
      command,
      timeout: options.timeout || 120000,
      cwd: options.cwd
    });
  }
}
```

## Command Queue for Multi-Command Handling

When Claude Code issues multiple commands (e.g., "check docker networking issues"), each command needs to execute in sequence and stream results back.

```typescript
class CommandQueue {
  private queue: QueuedCommand[] = [];
  private executing: boolean = false;

  enqueue(cmd: QueuedCommand): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      cmd.resolve = resolve;
      cmd.reject = reject;
      this.queue.push(cmd);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.executing || this.queue.length === 0) return;

    this.executing = true;
    const cmd = this.queue.shift()!;

    try {
      const result = await this.executeCommand(cmd);
      cmd.resolve!(result);
    } catch (error) {
      cmd.reject!(error);
    } finally {
      this.executing = false;
      this.processNext();
    }
  }

  private async executeCommand(cmd: QueuedCommand): Promise<CommandResult> {
    // Send command to tmux
    this.tmuxStream.write(`send-keys "${cmd.command}" Enter\n`);

    // Wait for %begin ... %end
    return new Promise((resolve) => {
      const output: string[] = [];
      let exitCode = 0;

      const listener = (msg: ControlMessage) => {
        if (msg.type === 'output') {
          output.push(msg.data);
          // Stream to Claude Code in real-time
          this.streamToMCP(msg.data);
        }
        if (msg.type === 'end') {
          exitCode = msg.exitCode || 0;
          this.removeListener(listener);
          resolve({ stdout: output.join('\n'), exitCode });
        }
      };

      this.parser.on('message', listener);
    });
  }
}
```

## MCP Server Implementation

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RemoteSession } from './remote/session.js';

const server = new Server({
  name: 'remote-command-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

const session = new RemoteSession();

// Register tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'remote_bash',
      description: 'Execute bash commands on remote host',
      inputSchema: { /* ... */ }
    },
    {
      name: 'remote_connect',
      description: 'Connect to remote host',
      inputSchema: { /* ... */ }
    },
    // ... other tools
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  switch (request.params.name) {
    case 'remote_bash':
      if (!session.isConnected()) {
        return {
          content: [{
            type: 'text',
            text: 'Error: Not connected to any remote host. Use remote_connect first.'
          }],
          isError: true
        };
      }

      const result = await session.execute(
        request.params.arguments.command,
        {
          timeout: request.params.arguments.timeout,
          cwd: request.params.arguments.cwd
        }
      );

      return {
        content: [{
          type: 'text',
          text: result.stdout
        }]
      };

    case 'remote_connect':
      await session.connect(request.params.arguments.host, {});
      return {
        content: [{
          type: 'text',
          text: `Connected to ${request.params.arguments.host}`
        }]
      };

    // ... handle other tools
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Claude Code Configuration

Add to Claude Code's MCP settings:

```json
{
  "mcpServers": {
    "remote-command": {
      "command": "node",
      "args": ["/home/user/remote-command/dist/index.js"]
    }
  }
}
```

## Usage Flow

1. **User asks Claude Code**: "Connect to my production server and check docker containers"

2. **Claude Code sees tools**: `remote_connect`, `remote_bash`

3. **Claude Code calls**:
   ```javascript
   // First call
   remote_connect({ host: "production" })

   // Second call
   remote_bash({ command: "docker ps -a" })
   ```

4. **Our MCP server**:
   - Establishes SSH connection
   - Starts tmux control mode
   - Executes command
   - Streams output back
   - Returns formatted result

5. **Claude Code receives**: Normal command output, processes it naturally

## Alternative: Simpler Wrapper Approach (Not Recommended)

If you don't want to build an MCP server, you could create a simple wrapper:

```bash
#!/bin/bash
# remote-bash-wrapper.sh

if [ -f ~/.remote-command-session ]; then
  # Connected to remote
  REMOTE_HOST=$(cat ~/.remote-command-session)
  ssh $REMOTE_HOST "cd $(pwd) && $@"
else
  # Execute locally
  eval "$@"
fi
```

Then configure Claude Code to use this wrapper instead of bash. However, this approach:
- Loses streaming capability
- Harder to manage sessions
- No proper error handling
- Can't queue commands efficiently

## Recommendation

**Build the MCP Server approach** because:

1. **Native integration** with Claude Code
2. **Proper streaming** of command outputs
3. **Session management** built-in
4. **Tool visibility** - Claude knows what it can do
5. **Error handling** - Proper error propagation
6. **Extensible** - Easy to add more tools later

The tmux control mode gives you parseable output, and the MCP protocol gives you proper integration with Claude Code. This combination provides the seamless experience you're looking for.
