# Chrome Support

Chrome BiDi is implemented by launching Chrome directly and bootstrapping
[chromium-bidi](https://github.com/GoogleChromeLabs/chromium-bidi)'s `BidiServer`
in-process over a CDP connection — no ChromeDriver required.

## How it works

```
Your script
  └─ BiDiConnection (direct mode)
       ↕  in-process bridge
     BidiServer  (chromium-bidi)
       ↕  CDP WebSocket
     Chrome  (--remote-debugging-port=0)
```

1. Chrome launches with `--remote-debugging-port=0`; the assigned port is read from stderr.
2. A `MapperCdpConnection` connects to Chrome over CDP.
3. `BidiServer.createAndStart()` mounts the BiDi mapper on that CDP connection.
4. `BiDiConnection` is wired directly to `BidiServer` via a thin in-process bridge — no extra WebSocket hop.

## Usage

### Via `ff-bidi-run`

```bash
# Auto-resolve system stable Chrome
ff-bidi-run script.mjs --browser chrome

# Headless
ff-bidi-run script.mjs --browser chrome --headless

# Point at a specific Chrome binary
ff-bidi-run script.mjs --browser chrome --chrome-path /path/to/chrome

# Connect to an already-running BiDi WebSocket (you manage Chrome)
ff-bidi-run script.mjs --browser chrome --bidi-url ws://127.0.0.1:9222/session/abc
```

### Via `startSession`

```typescript
import { startSession } from 'ff-test-firefox-bidi-client';

// Auto-resolve system Chrome, launch headless
const session = await startSession({
  browser: 'chrome',
  headless: true,
});

await session.page.goto('https://example.com');
console.log(await session.page.title());

await session.close(); // shuts down Chrome
```

## `startSession` Chrome options

```typescript
const session = await startSession({
  browser: 'chrome';          // required

  chromePath?: string;  // path to Chrome binary; default: system stable Chrome  ($CHROME_PATH)
  headless?: boolean;   // run headless                                           ($CHROME_HEADLESS === '1')
  args?: string[];      // extra Chrome flags
  biDiUrl?: string;     // connect to existing BiDi WS instead of launching      ($CHROME_BIDI_URL)
});
```

When `biDiUrl` is not set, Chrome is resolved in order:
1. `chromePath` / `$CHROME_PATH` — use this binary directly
2. System stable Chrome — found via `computeSystemExecutablePath`
3. Download stable Chrome via `@puppeteer/browsers` into `~/.cache/ff-bidi-client`

## `ChromeLauncher` (low-level API)

`ChromeLauncher` is exported for advanced use — for example if you need to launch
Chrome and attach a custom `BiDiConnection`.

```typescript
import { ChromeLauncher, BiDiConnection } from 'ff-test-firefox-bidi-client';

const launcher = new ChromeLauncher();
const connection = new BiDiConnection();

await launcher.launch(connection, {
  chromePath: '/path/to/chrome',
  headless: true,
  args: ['--window-size=1280,720'],
});

// connection is now in direct mode — use it like any BiDiConnection
await connection.sendCommand('session.new', { capabilities: {} });
const tree = await connection.sendCommand('browsingContext.getTree', {});

// ...

await connection.close();
await launcher.kill();
```

## Module layout

| File | Responsibility |
|------|----------------|
| `launcher.ts` | `ChromeLauncher` — orchestrates process, CDP, BidiServer |
| `resolve.ts`  | Chrome binary resolution and `@puppeteer/browsers` download |
| `transport.ts` | `WsTransport` — adapts a WebSocket to chromium-bidi's `Transport` interface |
| `index.ts`    | Public re-exports |
