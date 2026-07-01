# firefox-bidi-client

Minimal WebDriver BiDi protocol client for Firefox and Chrome. Provides both a high-level page API for writing scripts quickly and low-level primitives for direct BiDi communication and browser process management.

## What This Package Does

- `startSession` / `Session` — launch a browser and get a ready-to-use page
- `BiDiPage` — page-level helpers: navigate, evaluate scripts, click, type, wait, screenshot
- `BiDiConnection` — WebSocket connection, send commands, receive responses/events
- `FirefoxProcessManager` — launch Firefox and discover its BiDi port

Both layers can be mixed freely: `session.connection` exposes the raw connection for any BiDi command not covered by `BiDiPage`.

## Installation

```bash
npm install ff-test-firefox-bidi-client
```

## Quick Start

```typescript
import { startSession } from 'ff-test-firefox-bidi-client';

const session = await startSession({ headless: true });

await session.page.goto('https://example.com');
console.log(await session.page.title());

await session.close();
```

## CLI: ff-bidi-run

`ff-bidi-run` is a thin script runner that translates CLI flags into environment variables, adds a watchdog timeout, and executes your script.

```bash
ff-bidi-run <script.mjs> [options]

Browser selection:
  -b, --browser <browser>   Browser to use: firefox (default) or chrome

Firefox options:
  -f, --firefox <path>      Path to Firefox binary
  -p, --profile <path>      Path to Firefox profile directory
      --pref <key=value>    Set a Firefox preference (repeatable)
      --headless            Run Firefox in headless mode

Chrome options:
      --headless             Run Chrome in headless mode
      --chrome-path <path>   Path to Chrome binary (default: system stable Chrome)
      --bidi-url <url>       Connect to an existing BiDi WebSocket URL

General options:
  -d, --debug               Enable BiDi debug logging
  -t, --timeout <ms>        Script timeout in ms (default: 30000)
```

Firefox example:

```bash
ff-bidi-run my-script.mjs --headless --firefox /usr/bin/firefox --pref dom.ipc.processCount=1
```

Chrome example:

```bash
ff-bidi-run my-script.mjs --browser chrome --headless
```

Your script just calls `startSession` normally — the runner injects the options via environment variables.

## API Reference

### startSession(options?)

**Firefox** (default):

```typescript
const session = await startSession({
  browser?: 'firefox';            // default: $BIDI_BROWSER, then 'firefox'
  firefoxPath?: string;           // default: $FIREFOX_PATH
  headless?: boolean;             // default: $FIREFOX_HEADLESS === '1'
  viewport?: { width, height };
  profilePath?: string;           // default: $FIREFOX_PROFILE
  args?: string[];
  env?: Record<string, string>;
  logFile?: string;
  acceptInsecureCerts?: boolean;
  prefs?: Record<string, any>;    // default: $FIREFOX_PREFS as JSON
});
```

**Chrome** — see [src/chrome/README.md](src/chrome/README.md) for full options and setup details.

```typescript
const session = await startSession({
  browser: 'chrome',
  headless: true,
  // chromePath, chromeChannel, chromeVersion, biDiUrl — see Chrome README
});
```

### Session

```typescript
session.page             // BiDiPage for the initial browsing context
session.connection       // underlying BiDiConnection (for raw commands)

await session.newPage()          // open a new tab, returns BiDiPage
session.getPage(contextId)       // wrap an existing context (iframe, child)
await session.close()            // close connection and kill the browser
```

### BiDiPage

```typescript
// Navigation
await page.goto(url, { wait?: 'none' | 'interactive' | 'complete' });
await page.navigate(url, options);   // alias for goto

// Script evaluation
const title = await page.evaluate('document.title');
const text  = await page.evaluate(() => document.body.innerText);
const el    = await page.evaluate(sel => document.querySelector(sel)?.textContent, '#heading');

// Interaction
await page.click(selector);          // locate by CSS, scroll into view, click
await page.type(selector, text);     // click to focus, then dispatch key events
await page.performActions(actions);  // raw input.performActions array

// Waiting
await page.waitForSelector(selector, { timeout?: number, interval?: number });
await page.waitForFunction(expr, options);
await page.waitFor(expr, options);   // alias for waitForFunction

// Page info
const title = await page.title();
const url   = await page.url();

// Screenshot
const buffer = await page.screenshot({ path?: string });
```

### BiDiConnection

```typescript
const connection = new BiDiConnection({
  connectionTimeout: 5000,  // ms
  commandTimeout: 10000,    // ms
});

await connection.connect(port: number);   // Firefox: port number or ws:// URL

const result = await connection.sendCommand(method: string, params?: any);

await connection.subscribe(events: string[], contexts?: string[]);

connection.on('message', (event) => { /* raw BiDi events */ });
connection.onEvent('log.entryAdded', (params) => { /* named event */ });

connection.isConnected();
await connection.close();
```

### FirefoxProcessManager

```typescript
const manager = new FirefoxProcessManager();

const port = await manager.launch({
  firefoxPath?: string;
  headless?: boolean;
  viewport?: { width, height };
  profilePath?: string;
  args?: string[];
  env?: Record<string, string>;
  logFile?: string;
});

manager.isRunning();
manager.getPort();
await manager.kill();
```

## Examples

### Interact with a page

```typescript
import { startSession } from 'ff-test-firefox-bidi-client';

const session = await startSession({ headless: true });

await session.page.goto('https://example.com/login');
await session.page.type('#username', 'alice');
await session.page.type('#password', 'secret');
await session.page.click('#submit');
await session.page.waitForSelector('.dashboard');

console.log('Logged in, URL:', await session.page.url());
await session.close();
```

### Subscribe to console events

```typescript
session.connection.onEvent('log.entryAdded', ({ level, text }) => {
  console.log(`[${level}] ${text}`);
});

await session.connection.subscribe(['log.entryAdded']);
```

### Low-level API

```typescript
import { BiDiConnection, FirefoxProcessManager } from 'ff-test-firefox-bidi-client';

const manager = new FirefoxProcessManager();
const port = await manager.launch({ headless: true });

const connection = new BiDiConnection();
await connection.connect(port);

await connection.sendCommand('session.new', { capabilities: {} });
const tree = await connection.sendCommand('browsingContext.getTree', {});
const contextId = tree.contexts[0].context;

await connection.sendCommand('browsingContext.navigate', {
  context: contextId,
  url: 'https://example.com',
  wait: 'complete',
});

const result = await connection.sendCommand('script.evaluate', {
  expression: 'document.title',
  target: { context: contextId },
  awaitPromise: false,
});

console.log('Title:', result.result.value);

await connection.close();
await manager.kill();
```

### Connect to existing Firefox

```typescript
// Start Firefox manually: firefox --remote-debugging-port=9222
const connection = new BiDiConnection();
await connection.connect(9222);
```

## Chrome Support

Chrome is supported via an in-process `BidiServer` (no ChromeDriver). See **[src/chrome/README.md](src/chrome/README.md)** for setup, options, and implementation details.

## BiDi Protocol Resources

- [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- [Firefox BiDi Implementation](https://wiki.mozilla.org/WebDriver/RemoteProtocol/WebDriver_BiDi)

## License

MIT OR Apache-2.0
