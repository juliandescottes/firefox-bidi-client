# firefox-bidi-client

Minimal WebDriver BiDi protocol client for Firefox. Provides both a high-level page API for writing scripts quickly and low-level primitives for direct BiDi communication and Firefox process management.

## What This Package Does

- `startSession` / `Session` - High-level API: launch Firefox, connect, and get a ready-to-use page
- `BiDiPage` - Page-level helpers: navigate, evaluate scripts, click, type, wait, screenshot
- `BiDiConnection` - WebSocket connection, send commands, receive responses/events
- `FirefoxProcessManager` - Launch Firefox and discover BiDi port

Both layers can be mixed freely: `session.connection` exposes the raw connection for any BiDi command not covered by `BiDiPage`.

## CLI: ff-bidi-run

`ff-bidi-run` is a thin script runner that translates CLI flags into the environment variables read by `startSession`, adds a watchdog timeout, and executes your script.

```bash
ff-bidi-run <script.mjs> [options]

Options:
  -f, --firefox <path>      Path to Firefox binary
  -p, --profile <path>      Path to Firefox profile directory
      --pref <key=value>    Set a Firefox preference (repeatable)
      --headless            Run Firefox in headless mode
  -d, --debug               Enable BiDi debug logging
  -t, --timeout <ms>        Script timeout in ms (default: 30000)
```

Example:

```bash
ff-bidi-run my-script.mjs --headless --firefox /usr/bin/firefox --pref dom.ipc.processCount=1
```

Your script just calls `startSession` normally — the runner injects the options via environment variables.

## Installation

```bash
npm install ff-test-firefox-bidi-client
```

## Quick Start

### High-level API

```typescript
import { startSession } from 'ff-test-firefox-bidi-client';

const session = await startSession({ headless: true });

await session.page.goto('https://example.com');
const title = await session.page.title();
console.log('Title:', title);

await session.close();
```

### Low-level API

```typescript
import { BiDiConnection, FirefoxProcessManager } from 'ff-test-firefox-bidi-client';

const manager = new FirefoxProcessManager();
const port = await manager.launch({
  headless: true,
  viewport: { width: 1280, height: 720 },
});

const connection = new BiDiConnection();
await connection.connect(port);

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

## API Reference

### startSession(options?)

```typescript
const session = await startSession({
  firefoxPath?: string;           // Path to Firefox binary (default: $FIREFOX_PATH)
  headless?: boolean;             // Run headless (default: $FIREFOX_HEADLESS === '1')
  viewport?: { width, height };   // Window size
  profilePath?: string;           // Profile directory (default: $FIREFOX_PROFILE)
  args?: string[];                // Additional Firefox args
  env?: Record<string, string>;   // Environment variables
  logFile?: string;               // Log output file
  acceptInsecureCerts?: boolean;  // Accept TLS errors
  prefs?: Record<string, any>;    // Firefox prefs (default: $FIREFOX_PREFS as JSON)
});
```

Environment variables are used as fallbacks for any option not explicitly set.

### Session

```typescript
session.page             // BiDiPage for the initial browsing context
session.connection       // underlying BiDiConnection (for raw commands)

await session.newPage()              // open a new tab, returns BiDiPage
session.getPage(contextId)          // wrap an existing context (iframe, child)
await session.close()               // close connection and kill Firefox
```

### BiDiPage

```typescript
// Navigation
await page.goto(url, { wait?: 'none' | 'interactive' | 'complete' });
await page.navigate(url, options);   // alias for goto

// Script evaluation — matches Playwright's page.evaluate() signature
const title = await page.evaluate('document.title');
const text  = await page.evaluate(() => document.body.innerText);
const el    = await page.evaluate(sel => document.querySelector(sel)?.textContent, '#heading');

// Interaction
await page.click(selector);          // locate by CSS, scroll into view, click
await page.type(selector, text);     // click to focus, then dispatch key events
await page.performActions(actions);  // raw input.performActions array

// Waiting
await page.waitForSelector(selector, { timeout?: number, interval?: number });
await page.waitForFunction(expr, options);  // poll until expression returns truthy
await page.waitFor(expr, options);          // alias for waitForFunction

// Page info
const title = await page.title();
const url   = await page.url();

// Screenshot
const buffer = await page.screenshot({ path?: string });
```

### BiDiConnection

```typescript
const connection = new BiDiConnection({
  connectionTimeout: 5000,  // Connection timeout (ms)
  commandTimeout: 10000,    // Command timeout (ms)
});

await connection.connect(port: number);

const result = await connection.sendCommand(method: string, params?: any);

await connection.subscribe(events: string[], contexts?: string[]);

connection.on('message', (event) => {
  if (event.method === 'log.entryAdded') {
    console.log('Console log:', event.params);
  }
});

const connected = connection.isConnected();

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

const running = manager.isRunning();
const port = manager.getPort();
await manager.kill();
```

## Examples

### Interact with a page

```typescript
import { startSession } from 'ff-test-firefox-bidi-client';

const session = await startSession({ headless: true });
const { page } = session;

await page.goto('https://example.com/login');
await page.type('#username', 'alice');
await page.type('#password', 'secret');
await page.click('#submit');
await page.waitForSelector('.dashboard');

console.log('Logged in, URL:', await page.url());
await session.close();
```

### Subscribe to console events

```typescript
session.connection.on('message', (event) => {
  if (event.method === 'log.entryAdded') {
    const { level, text } = event.params;
    console.log(`[${level}] ${text}`);
  }
});

await session.connection.subscribe(['log.entryAdded']);
```

### Connect to existing Firefox

```typescript
import { BiDiConnection } from 'ff-test-firefox-bidi-client';

// Start Firefox manually with: firefox --remote-debugging-port=9222
const connection = new BiDiConnection();
await connection.connect(9222);
```

### Custom logger

```typescript
import { setLogger, type Logger } from 'ff-test-firefox-bidi-client';

const myLogger: Logger = {
  log: (msg) => console.log(msg),
  debug: (msg) => console.debug(msg),
  error: (msg, err) => console.error(msg, err),
};

setLogger(myLogger);
```

## BiDi Protocol Resources

- [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- [Firefox BiDi Implementation](https://wiki.mozilla.org/WebDriver/RemoteProtocol/WebDriver_BiDi)

## License

MIT OR Apache-2.0
