/**
 * Simple logger utility with optional file logging
 */

import * as fs from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private fileStream: fs.WriteStream | null = null;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setLogFile(filePath: string): void {
    this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  private log(level: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${level}] ${args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}`;

    // Always write to stderr
    console.error(message);

    // Also write to file if configured
    if (this.fileStream) {
      this.fileStream.write(message + '\n');
    }
  }

  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', ...args);
    }
  }

  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
    }
  }
}

export const logger = new Logger();

// Set log level from environment
const logLevel = process.env.LOG_LEVEL?.toUpperCase();
if (logLevel && logLevel in LogLevel) {
  logger.setLevel(LogLevel[logLevel as keyof typeof LogLevel]);
}

// Set log file from environment
const logFile = process.env.LOG_FILE;
if (logFile) {
  logger.setLogFile(logFile);
}
