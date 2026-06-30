export { BiDiConnection } from './bidi-connection.js';
export { FirefoxProcessManager } from './process-manager.js';
export { BiDiPage } from './bidi-page.js';
export { startSession, Session } from './session.js';
export { setLogger, ConsoleLogger, type Logger } from './logger.js';

export type {
  FirefoxLaunchOptions,
  BiDiConnectionOptions,
  BrowsingContext,
  GetTreeResult,
  EventHandler,
} from './types.js';

export type {
  NavigateOptions,
  WaitForOptions,
  ScreenshotOptions,
} from './bidi-page.js';

export type { SessionOptions } from './session.js';
