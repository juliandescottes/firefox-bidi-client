import { FirefoxProcessManager } from './process-manager.js';
import { BiDiConnection } from './bidi-connection.js';
import { BiDiPage } from './bidi-page.js';
import { setLogger, ConsoleLogger } from './logger.js';
import { ChromeLauncher } from './chrome/index.js';
import type { FirefoxLaunchOptions, ChromeLaunchOptions } from './types.js';

export type SessionOptions = FirefoxLaunchOptions | ChromeLaunchOptions;

export class Session {
  readonly page: BiDiPage;

  constructor(
    readonly connection: BiDiConnection,
    private readonly manager: FirefoxProcessManager | null,
    initialContextId: string,
    private readonly onClose?: () => Promise<void>
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
    await this.manager?.kill();
    await this.onClose?.();
  }
}

export async function startSession(options: SessionOptions = {}): Promise<Session> {
  if (process.env.BIDI_DEBUG === '1') {
    setLogger(new ConsoleLogger(true));
  }

  const browser = options.browser ?? (process.env.BIDI_BROWSER as 'firefox' | 'chrome' | undefined) ?? 'firefox';

  if (browser === 'chrome') {
    const opts = options as ChromeLaunchOptions;

    const headless = opts.headless ?? (process.env.CHROME_HEADLESS === '1');
    const biDiUrlOption = opts.biDiUrl ?? process.env.CHROME_BIDI_URL;
    const chromePathOption = opts.chromePath ?? process.env.CHROME_PATH;

    if (biDiUrlOption) {
      // Raw BiDi URL — user manages everything
      const connection = new BiDiConnection();
      await connection.connect(biDiUrlOption);
      try {
        await connection.sendCommand('session.new', { capabilities: {} });
      } catch { /* session already exists */ }
      const tree = await connection.sendCommand('browsingContext.getTree', {});
      const initialContextId = tree.contexts[0].context;
      return new Session(connection, null, initialContextId);
    }

    // Auto-launch Chrome with BidiServer bridged directly (no WebSocket indirection)
    const launcher = new ChromeLauncher();
    const connection = new BiDiConnection();
    await launcher.launch(connection, {
      chromePath: chromePathOption,
      headless,
      args: opts.args,
    });

    await connection.sendCommand('session.new', { capabilities: {} });
    const tree = await connection.sendCommand('browsingContext.getTree', {});
    const initialContextId = tree.contexts[0].context;

    return new Session(connection, null, initialContextId, () => launcher.kill());
  }

  // Firefox (default)
  const opts = options as FirefoxLaunchOptions;
  const resolvedOptions: FirefoxLaunchOptions = {
    ...opts,
    firefoxPath: opts.firefoxPath ?? process.env.FIREFOX_PATH,
    profilePath: opts.profilePath ?? process.env.FIREFOX_PROFILE,
    headless:    opts.headless    ?? (process.env.FIREFOX_HEADLESS === '1'),
    prefs:       opts.prefs       ?? (process.env.FIREFOX_PREFS ? JSON.parse(process.env.FIREFOX_PREFS) : undefined),
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
