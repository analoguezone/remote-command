/**
 * Simple logger utility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.error('[DEBUG]', ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.error('[INFO]', ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.error('[WARN]', ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
}

export const logger = new Logger();

// Set log level from environment
const logLevel = process.env.LOG_LEVEL?.toUpperCase();
if (logLevel && logLevel in LogLevel) {
  logger.setLevel(LogLevel[logLevel as keyof typeof LogLevel]);
}
