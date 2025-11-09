/**
 * MCP Server Implementation
 *
 * Provides tools for Claude Code to execute commands on remote hosts.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { RemoteSession } from '../remote/session.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ApprovalManager, classifyCommand } from '../utils/command-safety.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
const VERSION = packageJson.version;

// Safety mode from environment variable
type SafetyMode = 'unrestricted' | 'interactive' | 'read-only';
const SAFETY_MODE = (process.env.SAFETY_MODE || 'interactive') as SafetyMode;

export class RemoteCommandMCPServer {
  private server: Server;
  private session: RemoteSession;
  private approvalManager: ApprovalManager;

  constructor() {
    this.approvalManager = new ApprovalManager();
    this.server = new Server(
      {
        name: 'remote-command-server',
        version: VERSION
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.session = new RemoteSession();
    this.setupHandlers();
    this.setupSessionEventHandlers();
  }

  /**
   * Set up session event handlers
   */
  private setupSessionEventHandlers(): void {
    this.session.on('connected', (status) => {
      logger.info('Session connected:', status);
    });

    this.session.on('disconnected', () => {
      logger.info('Session disconnected');
    });
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'remote_connect':
            return await this.handleConnect(args as any);

          case 'remote_disconnect':
            return await this.handleDisconnect();

          case 'remote_bash':
            return await this.handleBash(args as any);

          case 'remote_status':
            return await this.handleStatus();

          case 'remote_approve':
            return await this.handleApprove(args as any);

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`
                }
              ],
              isError: true
            };
        }
      } catch (error: any) {
        logger.error(`Tool ${name} failed:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * Get list of tools
   */
  private getTools(): Tool[] {
    return [
      {
        name: 'remote_connect',
        description: 'Connect to a remote host for command execution. Supports both pre-configured hosts and ad-hoc connections. You can connect to ANY host on-the-fly without pre-configuration.',
        inputSchema: {
          type: 'object',
          properties: {
            host: {
              type: 'string',
              description: 'Remote host to connect to. Can be: 1) Config name (e.g., "production"), 2) user@host format (e.g., "ubuntu@192.168.1.100"), 3) user@host:port (e.g., "root@server.com:2222"), or 4) just hostname/IP (uses default user)'
            },
            user: {
              type: 'string',
              description: 'SSH username (optional, overrides user in host string or uses current user as default)'
            },
            port: {
              type: 'number',
              description: 'SSH port (optional, default: 22)'
            },
            identity_file: {
              type: 'string',
              description: 'Path to SSH private key file (optional, defaults to ~/.ssh/id_rsa, ~/.ssh/id_ed25519, or ~/.ssh/id_ecdsa)'
            },
            password: {
              type: 'string',
              description: 'SSH password for password-based authentication (optional, less secure than key-based auth)'
            }
          },
          required: ['host']
        }
      },
      {
        name: 'remote_disconnect',
        description: 'Disconnect from the currently connected remote host',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'remote_bash',
        description: 'Execute a bash command on the connected remote host. Streams output in real-time.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute'
            },
            timeout: {
              type: 'number',
              description: 'Command timeout in milliseconds (default: 120000)'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for command execution'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'remote_status',
        description: 'Get current remote connection status and system information',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'remote_approve',
        description: 'Approve a pending dangerous command for execution. Required when SAFETY_MODE is interactive.',
        inputSchema: {
          type: 'object',
          properties: {
            approval_id: {
              type: 'string',
              description: 'The approval ID from the pending command request'
            },
            challenge: {
              type: 'string',
              description: 'The challenge code provided by the user to confirm approval'
            }
          },
          required: ['approval_id', 'challenge']
        }
      }
    ];
  }

  /**
   * Handle remote_connect tool
   */
  private async handleConnect(args: {
    host: string;
    user?: string;
    port?: number;
    identity_file?: string;
    password?: string;
  }) {
    if (this.session.isConnected()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Already connected to a remote host. Disconnect first.'
          }
        ],
        isError: true
      };
    }

    try {
      // Try to parse as config name first, then as user@host format
      let sshOptions = config.parseHost(args.host);

      // Override with inline parameters if provided
      if (args.user) {
        sshOptions.username = args.user;
      }

      if (args.port) {
        sshOptions.port = args.port;
      }

      if (args.identity_file) {
        sshOptions.identityFile = args.identity_file;
      }

      if (args.password) {
        // For password auth, we don't need identity file
        sshOptions.identityFile = undefined;
        // Add password to options (handled by session.connect)
        (sshOptions as any).password = args.password;
      }

      // Connect
      await this.session.connect(sshOptions);

      const status = this.session.getStatus();

      return {
        content: [
          {
            type: 'text',
            text: `Connected to ${status.user}@${status.remoteHost}:${sshOptions.port || 22}

MCP Server Version: ${VERSION}

System Info:
${JSON.stringify(status.systemInfo, null, 2)}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to connect: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle remote_disconnect tool
   */
  private async handleDisconnect() {
    if (!this.session.isConnected()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Not connected to any remote host'
          }
        ]
      };
    }

    await this.session.disconnect();

    return {
      content: [
        {
          type: 'text',
          text: 'Disconnected from remote host'
        }
      ]
    };
  }

  /**
   * Handle remote_bash tool
   */
  private async handleBash(args: { command: string; timeout?: number; cwd?: string }) {
    if (!this.session.isConnected()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Not connected to any remote host. Use remote_connect first.'
          }
        ],
        isError: true
      };
    }

    // Classify command for safety
    const classification = classifyCommand(args.command);
    logger.info(`Command classification: ${classification.level} - ${args.command}`);

    // Check safety mode
    if (SAFETY_MODE === 'read-only' && classification.level !== 'safe') {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️  COMMAND BLOCKED - Read-only mode enabled

Command: ${args.command}
Classification: ${classification.level}
Reason: ${classification.reason}

This command modifies the system and is not allowed in read-only mode.
To allow this command, set SAFETY_MODE=interactive or SAFETY_MODE=unrestricted in your MCP configuration.`
          }
        ],
        isError: true
      };
    }

    if (SAFETY_MODE === 'interactive' && classification.level === 'dangerous') {
      // Create pending approval
      const approval = this.approvalManager.createApproval(args.command, classification);
      logger.warn(`Dangerous command requires approval: ${args.command} (ID: ${approval.id})`);

      return {
        content: [
          {
            type: 'text',
            text: `⚠️  DANGEROUS COMMAND - Approval Required

Command: ${args.command}
Classification: ${classification.level}
Reason: ${classification.reason}

This command requires explicit user approval before execution.

Approval ID: ${approval.id}
Challenge Code: ${approval.challenge}
Expires in: 60 seconds

To approve this command, the user must provide the challenge code.
The AI assistant CANNOT automatically approve dangerous commands.

User should respond with:
"Execute with challenge code: ${approval.challenge}"

Then you can call remote_approve with:
- approval_id: ${approval.id}
- challenge: ${approval.challenge}`
          }
        ],
        isError: true
      };
    }

    // Execute the command (safe or unrestricted mode)
    try {
      const result = await this.session.execute(args.command, {
        timeout: args.timeout,
        cwd: args.cwd
      });

      // Format output
      let output = '';
      if (result.stdout) {
        output += result.stdout;
      }
      if (result.stderr) {
        output += '\n--- stderr ---\n' + result.stderr;
      }

      // Add exit code if non-zero
      if (result.exitCode !== 0) {
        output += `\n--- Exit code: ${result.exitCode} ---`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output || '(no output)'
          }
        ],
        isError: result.exitCode !== 0
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Command failed: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle remote_status tool
   */
  private async handleStatus() {
    const status = this.session.getStatus();

    if (!status.connected) {
      return {
        content: [
          {
            type: 'text',
            text: 'Status: Not connected\n\nAvailable remotes:\n' + config.listRemotes().join('\n')
          }
        ]
      };
    }

    const statusText = `Status: Connected

MCP Server Version: ${VERSION}
Safety Mode: ${SAFETY_MODE}
Host: ${status.user}@${status.remoteHost}
Connected at: ${status.connectedAt?.toISOString()}
Commands executed: ${status.commandsExecuted}

System Info:
${JSON.stringify(status.systemInfo, null, 2)}`;

    return {
      content: [
        {
          type: 'text',
          text: statusText
        }
      ]
    };
  }

  /**
   * Handle remote_approve tool
   */
  private async handleApprove(args: { approval_id: string; challenge: string }) {
    if (!this.session.isConnected()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Not connected to any remote host.'
          }
        ],
        isError: true
      };
    }

    // Verify the approval
    const approval = this.approvalManager.verifyApproval(args.approval_id, args.challenge);

    if (!approval) {
      logger.warn(`Invalid approval attempt: ID=${args.approval_id}, Challenge=${args.challenge}`);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Approval Failed

The approval ID or challenge code is invalid, or the approval has expired.

Possible reasons:
- Incorrect challenge code
- Approval ID not found
- Approval expired (60 second timeout)

Please request a new approval by running the command again.`
          }
        ],
        isError: true
      };
    }

    logger.info(`Approval granted for command: ${approval.command}`);

    // Execute the approved command
    try {
      const result = await this.session.execute(approval.command);

      // Format output
      let output = `✅ Command Approved and Executed\n\nCommand: ${approval.command}\n\n`;

      if (result.stdout) {
        output += result.stdout;
      }
      if (result.stderr) {
        output += '\n--- stderr ---\n' + result.stderr;
      }

      // Add exit code if non-zero
      if (result.exitCode !== 0) {
        output += `\n--- Exit code: ${result.exitCode} ---`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ],
        isError: result.exitCode !== 0
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Command execution failed: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Remote Command MCP Server started');
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.session.isConnected()) {
      await this.session.disconnect();
    }
    this.approvalManager.destroy();
    await this.server.close();
  }
}
