# firefox-bidi-client

Minimal WebDriver BiDi protocol client for Firefox. Provides both a high-level page API for writing scripts quickly and low-level primitives for direct BiDi communication and Firefox process management.

## Features

- **Minimal & focused** - Just connection, commands, and events
- **Pure BiDi protocol** - Direct WebSocket communication
- **Process management** - Launch and manage Firefox instances
- **Zero dependencies** (except `ws` for WebSocket)
- **TypeScript** - Fully typed
- **Flexible logging** - Bring your own logger

## What This Package Does

- `startSession` / `Session` - High-level API: launch Firefox, connect, and get a ready-to-use page
- `BiDiPage` - Page-level helpers: navigate, evaluate scripts, click, type, wait, screenshot
- `BiDiConnection` - WebSocket connection, send commands, receive responses/events
- `FirefoxProcessManager` - Launch Firefox and discover BiDi port

## Installation

```bash
npm install ff-test-firefox-bidi-client
```

## Quick Start

### High-level API (recommended)

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

// Launch Firefox
const manager = new FirefoxProcessManager();
const port = await manager.launch({
  headless: true,
  viewport: { width: 1280, height: 720 },
});

// Connect to BiDi
const connection = new BiDiConnection();
await connection.connect(port);

// Get context
const tree = await connection.sendCommand('browsingContext.getTree', {});
const contextId = tree.contexts[0].context;

// Navigate
await connection.sendCommand('browsingContext.navigate', {
  context: contextId,
  url: 'https://example.com',
  wait: 'complete',
});

// Execute script
const result = await connection.sendCommand('script.evaluate', {
  expression: 'document.title',
  target: { context: contextId },
  awaitPromise: false,
});

console.log('Title:', result.result.value);

// Cleanup
await connection.close();
await manager.kill();
```

## API Reference

### startSession(options?)

Launch Firefox and return a `Session` with a ready page.

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

High-level page helpers.

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
const title = await page.title();    // document.title
const url   = await page.url();      // location.href

// Screenshot
const buffer = await page.screenshot({ path?: string });
```

### BiDiConnection

Low-level BiDi WebSocket connection.

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

Manage Firefox process lifecycle.

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

## Design Philosophy

This package provides two layers:

1. **High-level** (`startSession`, `BiDiPage`) - Playwright-inspired helpers that cover the common 90%: navigate, evaluate, click, type, wait, screenshot.
2. **Low-level** (`BiDiConnection`, `FirefoxProcessManager`) - Raw primitives for anything the high-level API does not cover. `session.connection` exposes the connection directly so you can mix both layers freely.

## BiDi Protocol Resources

- [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- [Firefox BiDi Implementation](https://wiki.mozilla.org/WebDriver/RemoteProtocol/WebDriver_BiDi)

## License

MIT OR Apache-2.0
