import { writeFileSync } from 'node:fs';
import { BiDiConnection } from './bidi-connection.js';
import { logDebug } from './logger.js';

export interface NavigateOptions {
  timeout?: number;
}

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

export interface EvaluateOptions {
  timeout?: number;
}

export interface ClickOptions {
  timeout?: number;
}

export interface PerformActionsOptions {
  timeout?: number;
}

export interface ScreenshotOptions {
  path?: string;
  timeout?: number;
}

// ── BiDi remote value ────────────────────────────────────────────────────────

function unwrapRemoteValue(remote: any): any {
  if (!remote || typeof remote !== 'object') return remote;
  switch (remote.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return remote.value;
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'array':
      return (remote.value ?? []).map(unwrapRemoteValue);
    case 'object':
      if (Array.isArray(remote.value)) {
        return Object.fromEntries(
          remote.value.map(([k, v]: [any, any]) => [unwrapRemoteValue(k), unwrapRemoteValue(v)])
        );
      }
      return remote.value;
    default:
      return remote;
  }
}

// Serialize a JS value into a BiDi LocalValue for script.callFunction arguments
function serializeLocalValue(value: any): any {
  if (value === null)      return { type: 'null' };
  if (value === undefined) return { type: 'undefined' };
  if (typeof value === 'string')  return { type: 'string',  value };
  if (typeof value === 'number')  return { type: 'number',  value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (Array.isArray(value)) {
    return { type: 'array', value: value.map(serializeLocalValue) };
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      value: Object.entries(value).map(([k, v]) => [
        { type: 'string', value: k },
        serializeLocalValue(v),
      ]),
    };
  }
  throw new Error(`Cannot serialize value of type "${typeof value}" to BiDi LocalValue`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number | undefined, label: string): Promise<T> {
  if (ms === undefined) return promise;
  return Promise.race([
    promise,
    sleep(ms).then((): never => { throw new Error(`${label} timed out after ${ms}ms`); }),
  ]);
}

// ── BiDiPage ─────────────────────────────────────────────────────────────────

export class BiDiPage {
  constructor(
    private readonly connection: BiDiConnection,
    private readonly contextId: string
  ) {}

  get id(): string {
    return this.contextId;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async goto(url: string, options: NavigateOptions = {}): Promise<void> {
    const { timeout = 5000 } = options;

    await Promise.race([
      this.connection.sendCommand('browsingContext.navigate', {
        context: this.contextId,
        url,
        wait: 'complete',
      }),
      sleep(timeout).then(() => logDebug(`Navigation to ${url} timed out after ${timeout}ms`)),
    ]);

    logDebug(`Navigated to ${url}`);
  }

  /** @alias goto */
  async navigate(url: string, options?: NavigateOptions): Promise<void> {
    return this.goto(url, options);
  }

  // ── Script evaluation ──────────────────────────────────────────────────────

  /**
   * Evaluate a JS expression string or function in the page context.
   * Matches Playwright's page.evaluate() signature.
   *
   *   await page.evaluate('document.title')
   *   await page.evaluate(() => document.title)
   *   await page.evaluate(selector => document.querySelector(selector).textContent, '#heading')
   */
  async evaluate(expression: string | ((...args: any[]) => any), arg?: any, options: EvaluateOptions = {}): Promise<any> {
    const cmd = typeof expression === 'function'
      ? this.connection.sendCommand('script.callFunction', {
          functionDeclaration: expression.toString(),
          target: { context: this.contextId },
          awaitPromise: true,
          arguments: arg !== undefined ? [serializeLocalValue(arg)] : [],
        })
      : this.connection.sendCommand('script.evaluate', {
          expression,
          target: { context: this.contextId },
          awaitPromise: true,
        });

    const result = await withTimeout(cmd, options.timeout, 'evaluate');

    if (result.type === 'exception') {
      throw new Error(result.exceptionDetails?.text ?? 'Script exception');
    }
    return unwrapRemoteValue(result.result);
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /**
   * Send one or more BiDi input source actions and release when done.
   * Accepts the raw `actions` array from the input.performActions spec.
   */
  async performActions(actions: any[], options: PerformActionsOptions = {}): Promise<void> {
    await withTimeout(
      this.connection.sendCommand('input.performActions', { context: this.contextId, actions }),
      options.timeout,
      'performActions',
    );
    await this.connection.sendCommand('input.releaseActions', { context: this.contextId });
  }

  async click(selector: string, options: ClickOptions = {}): Promise<void> {
    const located = await withTimeout(
      this.connection.sendCommand('browsingContext.locateNodes', {
        context: this.contextId,
        locator: { type: 'css', value: selector },
        maxNodeCount: 1,
      }),
      options.timeout,
      `locateNodes(${selector})`,
    );

    if (!located.nodes?.length) {
      throw new Error(`Element not found: ${selector}`);
    }

    const element = located.nodes[0];

    // x/y 0,0 = element center; BiDi scrolls the element into view automatically
    await this.performActions([{
      type: 'pointer',
      id: 'mouse1',
      actions: [
        { type: 'pointerMove', x: 0, y: 0, origin: { type: 'element', element: { sharedId: element.sharedId } } },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    }], options);
    logDebug(`Clicked "${selector}"`);
  }

  /**
   * Click a selector to focus it, then dispatch key down/up pairs for each character.
   * For special keys use their Unicode code point (e.g. '' for Enter).
   */
  async type(selector: string, text: string): Promise<void> {
    await this.click(selector);
    await this.performActions([{
      type: 'key',
      id: 'keyboard',
      actions: text.split('').flatMap(char => [
        { type: 'keyDown', value: char },
        { type: 'keyUp', value: char },
      ]),
    }]);
    logDebug(`Typed ${text.length} characters into "${selector}"`);
  }

  // ── Waiting ────────────────────────────────────────────────────────────────

  /**
   * Poll until the expression/function returns truthy, or timeout.
   * Matches Playwright's page.waitForFunction().
   */
  async waitForFunction(
    expression: string | ((...args: any[]) => any),
    options: WaitForOptions = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 100 } = options;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return;
      } catch {
        // element may not exist yet — keep polling
      }
      await sleep(interval);
    }

    throw new Error(`waitForFunction timed out after ${timeout}ms`);
  }

  /** Wait until selector matches an element in the DOM. */
  async waitForSelector(selector: string, options: WaitForOptions = {}): Promise<void> {
    return this.waitForFunction(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
      options
    );
  }

  /** @alias waitForFunction */
  async waitFor(
    expression: string | ((...args: any[]) => any),
    options?: WaitForOptions
  ): Promise<void> {
    return this.waitForFunction(expression, options);
  }

  // ── Page info ──────────────────────────────────────────────────────────────

  async title(): Promise<string> {
    return this.evaluate('document.title');
  }

  async url(): Promise<string> {
    return this.evaluate('location.href');
  }

  // ── Screenshot ─────────────────────────────────────────────────────────────

  /**
   * Capture a screenshot. Returns a Buffer (matching Playwright's return type).
   * Pass { path } to also save to disk.
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    const result = await withTimeout(
      this.connection.sendCommand('browsingContext.captureScreenshot', { context: this.contextId }),
      options.timeout,
      'screenshot',
    );

    const buffer = Buffer.from(result.data as string, 'base64');

    if (options.path) {
      writeFileSync(options.path, buffer);
      logDebug(`Screenshot saved to "${options.path}"`);
    }

    return buffer;
  }
}
