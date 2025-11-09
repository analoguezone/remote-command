#!/usr/bin/env node

/**
 * Remote Command MCP Server
 * Entry point
 */

import { RemoteCommandMCPServer } from './mcp/server.js';
import { logger, LogLevel } from './utils/logger.js';

async function main() {
  // Set log level from environment
  const logLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
  if (logLevel in LogLevel) {
    logger.setLevel(LogLevel[logLevel as keyof typeof LogLevel]);
  }

  const server = new RemoteCommandMCPServer();

  // Handle shutdown signals
  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.stop();
    logger.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start server
  await server.start();

  logger.info('Remote Command MCP Server is running');
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
