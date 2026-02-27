# firefox-bidi-client

Minimal WebDriver BiDi protocol client for Firefox. Provides low-level primitives for BiDi communication and Firefox process management - no high-level orchestration or abstractions.

## Features

- ✅ **Minimal & focused** - Just connection, commands, and events
- ✅ **Pure BiDi protocol** - Direct WebSocket communication
- ✅ **Process management** - Launch and manage Firefox instances
- ✅ **Zero dependencies** (except `ws` for WebSocket)
- ✅ **TypeScript** - Fully typed
- ✅ **Flexible logging** - Bring your own logger

## What This Package Does

- `BiDiConnection` - WebSocket connection, send commands, receive responses/events
- `FirefoxProcessManager` - Launch Firefox and discover BiDi port

## What This Package Does NOT Do

- No context management (that's your responsibility)
- No navigation helpers (use `browsingContext.navigate` directly)
- No high-level abstractions (use BiDi commands directly)
- Build these in your application layer!

## Installation

```bash
npm install firefox-bidi-client
```

## Quick Start

```typescript
import { BiDiConnection, FirefoxProcessManager } from 'firefox-bidi-client';

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

### BiDiConnection

Low-level BiDi WebSocket connection.

```typescript
const connection = new BiDiConnection({
  connectionTimeout: 5000,  // Connection timeout (ms)
  commandTimeout: 10000,    // Command timeout (ms)
});

// Connect to BiDi endpoint
await connection.connect(port: number);

// Send command and get response
const result = await connection.sendCommand(method: string, params?: any);

// Subscribe to events
await connection.subscribe(events: string[], contexts?: string[]);

// Register event handler
connection.on('message', (event) => {
  if (event.method === 'log.entryAdded') {
    console.log('Console log:', event.params);
  }
});

// Check connection status
const connected = connection.isConnected();

// Close connection
await connection.close();
```

### FirefoxProcessManager

Manage Firefox process lifecycle.

```typescript
const manager = new FirefoxProcessManager();

// Launch Firefox and get BiDi port
const port = await manager.launch({
  firefoxPath?: string;           // Path to Firefox binary
  headless?: boolean;             // Run headless
  viewport?: { width, height };   // Window size
  profilePath?: string;           // Profile directory
  args?: string[];                // Additional args
  env?: Record<string, string>;   // Environment variables
  logFile?: string;               // Log output file
});

// Check if running
const running = manager.isRunning();

// Get port
const port = manager.getPort();

// Kill Firefox
await manager.kill();
```

## Examples

### Connect to existing Firefox

```typescript
import { BiDiConnection } from 'firefox-bidi-client';

// Start Firefox manually with: firefox --remote-debugging-port=9222
const connection = new BiDiConnection();
await connection.connect(9222);
```

### Subscribe to console events

```typescript
connection.on('message', (event) => {
  if (event.method === 'log.entryAdded') {
    const { level, text } = event.params;
    console.log(`[${level}] ${text}`);
  }
});

await connection.subscribe(['log.entryAdded']);
```

### Custom logger

```typescript
import { setLogger, type Logger } from 'firefox-bidi-client';

const myLogger: Logger = {
  log: (msg) => console.log(msg),
  debug: (msg) => console.debug(msg),
  error: (msg, err) => console.error(msg, err),
};

setLogger(myLogger);
```

## Design Philosophy

This package provides **primitives**, not abstractions. It handles:
1. WebSocket connection to BiDi endpoint
2. Command/response protocol
3. Event forwarding
4. Firefox process launching

You build the orchestration layer on top. This keeps the package:
- **Simple** - Easy to understand and debug
- **Flexible** - No imposed architecture
- **Focused** - Does one thing well
- **Reusable** - Works for any BiDi use case

## BiDi Protocol Resources

- [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- [Firefox BiDi Implementation](https://wiki.mozilla.org/WebDriver/RemoteProtocol/WebDriver_BiDi)

## License

MIT
