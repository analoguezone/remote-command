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
import { logger, LogLevel } from '../utils/logger.js';

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
        description: 'Connect to a remote host for command execution. Accepts either a configured host name from config or user@host format.',
        inputSchema: {
          type: 'object',
          properties: {
            host: {
              type: 'string',
              description: 'Remote host to connect to (config name or user@host[:port])'
            },
            identity_file: {
              type: 'string',
              description: 'SSH identity file path (optional, defaults to ~/.ssh/id_rsa)'
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
      }
    ];
  }

  /**
   * Handle remote_connect tool
   */
  private async handleConnect(args: { host: string; identity_file?: string }) {
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
      // Parse host (config name or user@host)
      const sshOptions = config.parseHost(args.host);

      // Override identity file if provided
      if (args.identity_file) {
        sshOptions.identityFile = args.identity_file;
      }

      // Connect
      await this.session.connect(sshOptions);

      const status = this.session.getStatus();

      return {
        content: [
          {
            type: 'text',
            text: `Connected to ${status.user}@${status.remoteHost}\n\nSystem Info:\n${JSON.stringify(status.systemInfo, null, 2)}`
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
