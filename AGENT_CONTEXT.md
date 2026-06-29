# firefox-bidi-client — API Reference

## Quick start

**JavaScript** (Node.js, top-level await):
```js
import { startSession } from 'ff-test-firefox-bidi-client';

const session = await startSession();
const { page, connection } = session;
try {
  // your steps here
} finally {
  await session.close();
}
```

**Python** (asyncio):
```python
import asyncio
from firefox_bidi_client import start_session

async def main():
    async with await start_session() as session:
        page, connection = session.page, session.connection
        # your steps here

asyncio.run(main())
```

---

## `startSession` / `start_session`

| Option (JS)           | Option (Python)         | Default     | Description                                 |
|-----------------------|-------------------------|-------------|---------------------------------------------|
| `firefoxPath`         | `firefox_path`          | auto-detect | Path to Firefox binary                      |
| `headless`            | `headless`              | `false`     | Run headless                                |
| `profilePath`         | `profile_path`          | temp dir    | Firefox profile directory                   |
| `viewport`            | `viewport`              | —           | `{ width, height }`                         |
| `args`                | `args`                  | —           | Extra Firefox CLI arguments                 |
| `acceptInsecureCerts` | `accept_insecure_certs` | `false`     | Accept TLS errors                           |
| `prefs`               | `prefs`                 | —           | Firefox preference overrides (dict)         |

Environment variable overrides: `FIREFOX_PATH`, `FIREFOX_HEADLESS=1`, `FIREFOX_PROFILE`, `BIDI_DEBUG=1`.

---

## `BiDiPage` (`session.page` / `session.new_page()`)

**`page.goto(url, {wait})`** / **`page.goto(url, wait=...)`**
Navigate to `url`. Resolves when the page reaches the requested load state: `'complete'` (default, `document.readyState === 'complete'`), `'interactive'`, or `'none'` (fires immediately after navigation starts).

**`page.evaluate(expr, arg?)`**
Run JavaScript in the page context and return the result. `expr` is a string — either an expression (`'document.title'`) or an arrow/function declaration (`'(x) => x * 2'`). When `arg` is provided, `expr` must be a function; `arg` is serialised and passed as its first argument. Has access to `document`, `window`, and all page globals.

**`page.click(selector)`**
Locate the first element matching the CSS selector and perform a pointer click (move → down → up). Throws if no element is found.

**`page.waitForSelector(sel, {timeout})`** / **`page.wait_for_selector(sel, timeout=5.0)`**
Poll until `document.querySelector(sel)` returns a non-null element. Throws on timeout. Timeout is in milliseconds (JS) or seconds (Python).

**`page.waitForFunction(expr, {timeout, interval})`** / **`page.wait_for_function(expr, timeout, interval)`**
Poll until the JS expression string returns a truthy value. Useful for waiting on arbitrary page state. Throws on timeout.

**`page.performActions(actions)`** / **`page.perform_actions(actions)`**
Send a raw BiDi `input.performActions` sequence and release. `actions` is the array of input sources as defined in the [WebDriver BiDi spec](https://w3c.github.io/webdriver-bidi/#command-input-performActions) — pointer, key, wheel, or none. Releases all actions afterward.

**`page.type(selector, text)`**
Click `selector` to focus it, then dispatch `keyDown`/`keyUp` pairs for each character in `text`. For special keys pass their Unicode code point (e.g. `''` for Enter, `''` for Backspace).

**`page.title()`** / **`page.url()`**
Return `document.title` and `location.href` respectively.

**`page.screenshot({path?})`** / **`page.screenshot(path?)`**
Capture the current viewport as PNG. Returns a `Buffer` (JS) or `bytes` (Python). If `path` is given, also writes the file to disk.

---

## `BiDiConnection` (`session.connection`)

**`connection.sendCommand(method, params)`** / **`connection.send_command(method, params)`**
Send a raw [WebDriver BiDi](https://w3c.github.io/webdriver-bidi/) command and wait for its response. Use this for protocol features not wrapped by `BiDiPage`.

**`connection.subscribe(events, contexts?)`**
Tell Firefox to start emitting the listed event types over the WebSocket. Must be called before `onEvent` handlers will fire. `contexts` optionally scopes delivery to specific browsing context IDs.

**`connection.onEvent(method, handler)`** / **`connection.on_event(method, handler)`**
Register a callback for a named BiDi event (e.g. `'log.entryAdded'`). The handler receives `event.params` directly. Subscribe to the event type first.

**`connection.offEvent(method, handler)`** / **`connection.off_event(method, handler)`**
Remove a handler registered with `onEvent`.

**Common BiDi event names:**

| Event                        | `params` fields of note                                      |
|------------------------------|--------------------------------------------------------------|
| `log.entryAdded`             | `level` (`'error'`\|`'warning'`\|`'info'`), `text`          |
| `network.beforeRequestSent`  | `request.url`, `request.method`                              |
| `network.responseCompleted`  | `request.url`, `response.status`                             |
| `network.fetchError`         | `request.url`, `errorText`                                   |

**Useful raw BiDi commands (via `sendCommand` / `send_command`):**

| Method                       | Key params                                      |
|------------------------------|-------------------------------------------------|
| `script.addPreloadScript`    | `functionDeclaration` — runs before each load  |
| `browsingContext.create`     | `{ type: 'tab' }`                               |
| `network.addIntercept`       | `phases`, `urlPatterns`                         |

---

## Session

| JS                        | Python                   | Description                              |
|---------------------------|--------------------------|------------------------------------------|
| `session.page`            | `session.page`           | Default `BiDiPage`                       |
| `session.connection`      | `session.connection`     | `BiDiConnection`                         |
| `session.newPage()`       | `session.new_page()`     | Open new tab, returns `BiDiPage`         |
| `session.getPage(id)`     | `session.get_page(id)`   | Wrap an existing browsing context        |
| `session.close()`         | `session.close()`        | Teardown Firefox and WebSocket           |

---

## Examples

See [`examples/`](examples/) (JavaScript) and [`python/examples/`](python/examples/) (Python):

| File                          | Pattern                                      |
|-------------------------------|----------------------------------------------|
| `check-console-errors`        | JS errors on page load (`log.entryAdded`)    |
| `check-element-visibility`    | Element invisible / zero-size                |
| `form-interaction`            | Fill + submit, wait for result               |
| `check-ua-sniffing`           | UA block message + Chrome UA override        |
| `check-network-errors`        | Failed requests, 4xx/5xx, fetch errors       |
