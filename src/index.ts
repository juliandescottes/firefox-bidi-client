/**
 * firefox-bidi-client
 *
 * Minimal WebDriver BiDi protocol client
 * Provides low-level primitives for BiDi communication and Firefox process management
 */

// Core protocol exports
export { BiDiConnection } from './bidi-connection.js';
export { FirefoxProcessManager } from './process-manager.js';

// Logger exports
export { setLogger, ConsoleLogger, type Logger } from './logger.js';

// Type exports
export type {
  FirefoxLaunchOptions,
  BiDiConnectionOptions,
  BrowsingContext,
  GetTreeResult,
  EventHandler,
} from './types.js';
