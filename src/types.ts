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
  /** Accept insecure certificates (passed via session.new capabilities) */
  acceptInsecureCerts?: boolean;
  /** Environment variables for Firefox process */
  env?: Record<string, string>;
  /** Path to log file for Firefox output */
  logFile?: string;
  /** Firefox preferences (passed via moz:firefoxOptions in session.new capabilities) */
  prefs?: Record<string, string | number | boolean>;
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
