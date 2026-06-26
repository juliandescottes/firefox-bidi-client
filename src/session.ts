import { FirefoxProcessManager } from './process-manager.js';
import { BiDiConnection } from './bidi-connection.js';
import { BiDiPage } from './bidi-page.js';
import { setLogger, ConsoleLogger } from './logger.js';
import type { FirefoxLaunchOptions } from './types.js';

export type SessionOptions = FirefoxLaunchOptions;

export class Session {
  readonly page: BiDiPage;

  constructor(
    readonly connection: BiDiConnection,
    private readonly manager: FirefoxProcessManager,
    initialContextId: string
  ) {
    this.page = new BiDiPage(connection, initialContextId);
  }

  /** Wrap an existing browsing context — use for iframes, child contexts, etc. */
  getPage(contextId: string): BiDiPage {
    return new BiDiPage(this.connection, contextId);
  }

  /** Open a new top-level browsing context (new tab). */
  async newPage(): Promise<BiDiPage> {
    const result = await this.connection.sendCommand('browsingContext.create', { type: 'tab' });
    return new BiDiPage(this.connection, result.context);
  }

  async close(): Promise<void> {
    await this.connection.close();
    await this.manager.kill();
  }
}

export async function startSession(options: SessionOptions = {}): Promise<Session> {
  if (process.env.BIDI_DEBUG === '1') {
    setLogger(new ConsoleLogger(true));
  }

  const resolvedOptions: FirefoxLaunchOptions = {
    ...options,
    firefoxPath:  options.firefoxPath  ?? process.env.FIREFOX_PATH,
    profilePath:  options.profilePath  ?? process.env.FIREFOX_PROFILE,
    headless:     options.headless     ?? (process.env.FIREFOX_HEADLESS === '1'),
    prefs:        options.prefs        ?? (process.env.FIREFOX_PREFS ? JSON.parse(process.env.FIREFOX_PREFS) : undefined),
  };

  const manager = new FirefoxProcessManager();
  const connection = new BiDiConnection();

  const port = await manager.launch(resolvedOptions);
  await connection.connect(port);

  const alwaysMatch: Record<string, any> = {};
  if (resolvedOptions.acceptInsecureCerts) {
    alwaysMatch.acceptInsecureCerts = true;
  }
  if (resolvedOptions.prefs && Object.keys(resolvedOptions.prefs).length > 0) {
    alwaysMatch['moz:firefoxOptions'] = { prefs: resolvedOptions.prefs };
  }
  await connection.sendCommand('session.new', { capabilities: { alwaysMatch } });

  const tree = await connection.sendCommand('browsingContext.getTree', {});
  const initialContextId = tree.contexts[0].context;

  return new Session(connection, manager, initialContextId);
}
