/**
 * Webcompat repro pattern: form or button interaction fails in Firefox
 *
 * Replace the URL, selectors, and expected outcome with the site under investigation.
 * Run: ff-bidi-run examples/form-interaction.mjs --firefox /path/to/firefox --headless
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://example.com';
const INPUT_SELECTOR = 'input[type="text"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';
const SUCCESS_SELECTOR = '.result';

const session = await startSession();
const { page } = session;

try {
  await page.goto(TARGET_URL);

  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [INPUT_SELECTOR, 'test value']);
  await page.click(SUBMIT_SELECTOR);

  // Wait up to 5 seconds for the result to appear
  try {
    await page.waitForSelector(SUCCESS_SELECTOR, { timeout: 5000 });
    console.log('issue not reproduced');
  } catch {
    const url = await page.url();
    console.log(`issue reproduced: expected result element not found after interaction (url: ${url})`);

    // Save a screenshot for debugging
    await page.screenshot({ path: 'repro-screenshot.png' });
    console.log('  screenshot saved to repro-screenshot.png');
  }
} finally {
  await session.close();
}
