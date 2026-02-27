/**
 * WebDriver BiDi Types
 */

export interface FirefoxLaunchOptions {
  /** Path to Firefox binary */
  firefoxPath?: string;
  /** Run Firefox in headless mode */
  headless?: boolean;
  /** Path to Firefox profile directory */
  profilePath?: string;
  /** Viewport size { width, height } */
  viewport?: { width: number; height: number };
  /** Additional Firefox arguments */
  args?: string[];
  /** URL to navigate to on startup */
  startUrl?: string;
  /** Accept insecure certificates */
  acceptInsecureCerts?: boolean;
  /** Environment variables for Firefox process */
  env?: Record<string, string>;
  /** Path to log file for Firefox output */
  logFile?: string;
  /** Firefox preferences to set at startup */
  prefs?: Record<string, string | number | boolean>;
  /** Connect to existing Firefox on this port instead of launching */
  remoteDebuggingPort?: number;
}

export interface BiDiConnectionOptions {
  /** Timeout for connection attempts (ms) */
  connectionTimeout?: number;
  /** Timeout for BiDi commands (ms) */
  commandTimeout?: number;
}

export interface PendingCommand {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  method: string;
}

export type EventHandler = (event: any) => void;

/**
 * BiDi browsing context
 */
export interface BrowsingContext {
  context: string;
  url?: string;
  children?: BrowsingContext[];
  parent?: string;
}

/**
 * Result of getTree command
 */
export interface GetTreeResult {
  contexts: BrowsingContext[];
}
