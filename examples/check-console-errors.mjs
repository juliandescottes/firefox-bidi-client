/**
 * Webcompat repro pattern: JavaScript errors on page load
 *
 * Console events are not captured by BiDiPage — subscribe via the connection directly.
 * Replace the URL with the site under investigation.
 * Run: ff-bidi-run examples/check-console-errors.mjs --firefox /path/to/firefox --headless
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://example.com';

const session = await startSession();
const { page, connection } = session;

const errors = [];
connection.onEvent('log.entryAdded', params => {
  if (params.level === 'error') errors.push(params.text);
});
await connection.subscribe(['log.entryAdded']);

try {
  await page.goto(TARGET_URL);

  // Wait briefly for any async scripts to fire errors
  await new Promise(r => setTimeout(r, 1000));

  if (errors.length > 0) {
    console.log('issue reproduced');
    for (const text of errors) {
      console.log(`  [error] ${text}`);
    }
  } else {
    console.log('issue not reproduced');
  }
} finally {
  await session.close();
}
