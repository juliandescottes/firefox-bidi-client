/**
 * Webcompat repro pattern: UA sniffing — site blocks or degrades Firefox
 *
 * Use this when you observed: a "browser not supported" / "use Chrome" message,
 * a redirect to a different page, or broken layout that disappeared when you
 * spoofed the UA to Chrome.
 *
 * Adjust TARGET_URL and BLOCK_PHRASES to the specific site and wording you saw.
 * Run: ff-bidi-run examples/check-ua-sniffing.mjs --firefox /path/to/firefox --headless
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://example.com';

// Text fragments you observed on the page when Firefox was blocked.
// Make these as specific as possible to avoid false positives.
const BLOCK_PHRASES = [
  'not supported',
  'use chrome',
  'browser not supported',
];

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function findBlockPhrase(page) {
  const text = await page.evaluate('document.body.innerText.toLowerCase()');
  return BLOCK_PHRASES.find(p => text.includes(p)) ?? null;
}

const session = await startSession();
const { page, connection } = session;

try {
  // Load with the real Firefox UA
  await page.goto(TARGET_URL);
  const blocker = await findBlockPhrase(page);

  if (!blocker) {
    console.log('issue not reproduced: no UA-blocking message detected');
  } else {
    console.log(`issue reproduced: page shows "${blocker}" with Firefox UA`);

    // Confirm by reloading with Chrome UA injected before page load
    await connection.sendCommand('script.addPreloadScript', {
      functionDeclaration:
        `() => { Object.defineProperty(navigator, 'userAgent', ` +
        `{ get: () => ${JSON.stringify(CHROME_UA)}, configurable: true }); }`,
    });
    await page.goto(TARGET_URL);
    const blockerAfterSpoof = await findBlockPhrase(page);

    if (!blockerAfterSpoof) {
      console.log('  confirmed: block disappears with Chrome UA — pure UA sniffing');
    } else {
      console.log('  note: block persists with Chrome UA — may not be UA sniffing alone');
    }
  }
} finally {
  await session.close();
}
