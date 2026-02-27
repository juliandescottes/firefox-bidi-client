/**
 * Logger interface for BiDi client
 * Allows consumers to provide their own logging implementation
 */

export interface Logger {
  log(message: string): void;
  debug(message: string): void;
  error(message: string, error?: unknown): void;
}

/**
 * Default no-op logger
 */
class NoOpLogger implements Logger {
  log(_message: string): void {}
  debug(_message: string): void {}
  error(_message: string, _error?: unknown): void {}
}

/**
 * Simple console logger
 */
export class ConsoleLogger implements Logger {
  constructor(private debug_enabled = false) {}

  log(message: string): void {
    console.log(message);
  }

  debug(message: string): void {
    if (this.debug_enabled) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  error(message: string, error?: unknown): void {
    console.error(message, error);
  }
}

let currentLogger: Logger = new NoOpLogger();

export function setLogger(logger: Logger): void {
  currentLogger = logger;
}

export function getLogger(): Logger {
  return currentLogger;
}

export function log(message: string): void {
  currentLogger.log(message);
}

export function logDebug(message: string): void {
  currentLogger.debug(message);
}

export function logError(message: string, error?: unknown): void {
  currentLogger.error(message, error);
}
