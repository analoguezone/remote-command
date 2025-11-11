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

export class RemoteCommandMCPServer {
  private server: Server;
  private session: RemoteSession;

  constructor() {
    this.server = new Server(
      {
        name: 'remote-command-server',
        version: '1.0.0'
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

          case 'remote_approval_mode':
            return await this.handleApprovalMode(args as any);

          case 'remote_list_pending':
            return await this.handleListPending();

          case 'remote_approve':
            return await this.handleApprove(args as any);

          case 'remote_deny':
            return await this.handleDeny(args as any);

          case 'remote_refine':
            return await this.handleRefine(args as any);

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
        name: 'remote_approval_mode',
        description: 'Enable or disable approval mode. When enabled, all commands require explicit approval before execution (similar to Warp terminal). When disabled, commands execute immediately.',
        inputSchema: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable (true) or disable (false) approval mode'
            }
          },
          required: ['enabled']
        }
      },
      {
        name: 'remote_list_pending',
        description: 'List all commands waiting for approval. Shows command ID, command text, working directory, and timestamp.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'remote_approve',
        description: 'Approve a pending command to allow it to execute. Use the command ID from remote_list_pending.',
        inputSchema: {
          type: 'object',
          properties: {
            command_id: {
              type: 'string',
              description: 'The ID of the command to approve (e.g., "cmd-1")'
            }
          },
          required: ['command_id']
        }
      },
      {
        name: 'remote_deny',
        description: 'Deny a pending command to prevent it from executing. The command will be cancelled.',
        inputSchema: {
          type: 'object',
          properties: {
            command_id: {
              type: 'string',
              description: 'The ID of the command to deny (e.g., "cmd-1")'
            }
          },
          required: ['command_id']
        }
      },
      {
        name: 'remote_refine',
        description: 'Refine a pending command by replacing it with a modified version. The original command is denied and a new one is queued for approval.',
        inputSchema: {
          type: 'object',
          properties: {
            command_id: {
              type: 'string',
              description: 'The ID of the command to refine (e.g., "cmd-1")'
            },
            new_command: {
              type: 'string',
              description: 'The refined/corrected command to replace the original'
            }
          },
          required: ['command_id', 'new_command']
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
            text: `Connected to ${status.user}@${status.remoteHost}:${sshOptions.port || 22}\n\nSystem Info:\n${JSON.stringify(status.systemInfo, null, 2)}`
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

Host: ${status.user}@${status.remoteHost}
Connected at: ${status.connectedAt?.toISOString()}
Commands executed: ${status.commandsExecuted}
Approval mode: ${status.approvalMode ? 'ENABLED' : 'DISABLED'}
Pending approvals: ${status.pendingApprovals || 0}

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
   * Handle remote_approval_mode tool
   */
  private async handleApprovalMode(args: { enabled: boolean }) {
    this.session.setApprovalMode(args.enabled);

    return {
      content: [
        {
          type: 'text',
          text: args.enabled
            ? '✓ Approval mode ENABLED\n\nAll commands will now require explicit approval before execution.\nUse remote_list_pending to see pending commands and remote_approve/remote_deny to approve or deny them.'
            : '✓ Approval mode DISABLED\n\nCommands will now execute immediately without requiring approval.'
        }
      ]
    };
  }

  /**
   * Handle remote_list_pending tool
   */
  private async handleListPending() {
    const approvalManager = this.session.getApprovalManager();
    const pending = approvalManager.getPendingCommands();

    if (pending.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No pending commands waiting for approval.'
          }
        ]
      };
    }

    const list = pending.map(cmd => {
      const timeAgo = Math.round((Date.now() - cmd.timestamp.getTime()) / 1000);
      return `[${cmd.id}] ${cmd.command}${cmd.cwd ? ` (cwd: ${cmd.cwd})` : ''}\n  Status: ${cmd.status} | Queued: ${timeAgo}s ago`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Pending Commands (${pending.length}):\n\n${list}\n\nUse remote_approve or remote_deny with the command ID to proceed.`
        }
      ]
    };
  }

  /**
   * Handle remote_approve tool
   */
  private async handleApprove(args: { command_id: string }) {
    const approvalManager = this.session.getApprovalManager();
    const cmd = approvalManager.getCommand(args.command_id);

    if (!cmd) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Command ${args.command_id} not found. Use remote_list_pending to see available commands.`
          }
        ],
        isError: true
      };
    }

    const success = approvalManager.approve(args.command_id);

    if (!success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not approve command ${args.command_id}. It may have already been approved or denied.`
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✓ Command approved: ${cmd.command}\n\nThe command will now execute.`
        }
      ]
    };
  }

  /**
   * Handle remote_deny tool
   */
  private async handleDeny(args: { command_id: string }) {
    const approvalManager = this.session.getApprovalManager();
    const cmd = approvalManager.getCommand(args.command_id);

    if (!cmd) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Command ${args.command_id} not found. Use remote_list_pending to see available commands.`
          }
        ],
        isError: true
      };
    }

    const success = approvalManager.deny(args.command_id);

    if (!success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not deny command ${args.command_id}. It may have already been approved or denied.`
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✓ Command denied: ${cmd.command}\n\nThe command has been cancelled and will not execute.`
        }
      ]
    };
  }

  /**
   * Handle remote_refine tool
   */
  private async handleRefine(args: { command_id: string; new_command: string }) {
    const approvalManager = this.session.getApprovalManager();
    const cmd = approvalManager.getCommand(args.command_id);

    if (!cmd) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Command ${args.command_id} not found. Use remote_list_pending to see available commands.`
          }
        ],
        isError: true
      };
    }

    const success = approvalManager.refine(args.command_id, args.new_command);

    if (!success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Could not refine command ${args.command_id}. It may have already been approved or denied.`
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✓ Command refined\n\nOriginal: ${cmd.command}\nNew: ${args.new_command}\n\nThe refined command has been queued and requires approval. Use remote_list_pending to see it.`
        }
      ]
    };
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
    await this.server.close();
  }
}
