/**
 * WebDriver BiDi Types
 */

export interface BrowserLaunchOptions {
  /** Run browser in headless mode */
  headless?: boolean;
  /** Viewport size { width, height } */
  viewport?: { width: number; height: number };
  /** Additional browser arguments */
  args?: string[];
  /** Accept insecure certificates (passed via session.new capabilities) */
  acceptInsecureCerts?: boolean;
  /** Environment variables for browser process */
  env?: Record<string, string>;
  /** Path to log file for browser output */
  logFile?: string;
}

export interface FirefoxLaunchOptions extends BrowserLaunchOptions {
  browser?: 'firefox';
  /** Path to Firefox binary */
  firefoxPath?: string;
  /** Path to Firefox profile directory */
  profilePath?: string;
  /** Firefox preferences (passed via moz:firefoxOptions in session.new capabilities) */
  prefs?: Record<string, string | number | boolean>;
}

export interface ChromeLaunchOptions {
  browser: 'chrome';
  /** Path to Chrome binary. When set, skips auto-resolve. Defaults to $CHROME_PATH. */
  chromePath?: string;
  /** Run Chrome in headless mode. Defaults to $CHROME_HEADLESS === '1'. */
  headless?: boolean;
  /** Additional Chrome arguments. */
  args?: string[];
  /**
   * WebSocket URL of an already-established BiDi session.
   * When set, connects directly without launching Chrome.
   * Defaults to $CHROME_BIDI_URL.
   */
  biDiUrl?: string;
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
