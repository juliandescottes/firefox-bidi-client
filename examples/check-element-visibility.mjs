/**
 * Webcompat repro pattern: element is invisible or misrendered in Firefox
 *
 * Replace TARGET_URL and SELECTOR with the site and element under investigation.
 * Run: ff-bidi-run examples/check-element-visibility.mjs --firefox /path/to/firefox --headless
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://example.com';
const SELECTOR = 'p';

const session = await startSession();
const { page } = session;

try {
  await page.goto(TARGET_URL);

  const info = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(SELECTOR)});
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display:    s.display,
      visibility: s.visibility,
      opacity:    s.opacity,
      width:      el.getBoundingClientRect().width,
      height:     el.getBoundingClientRect().height,
    };
  })()`);

  if (!info) {
    console.log('issue reproduced: element not found');
  } else if (
    info.display === 'none' ||
    info.visibility === 'hidden' ||
    info.opacity === '0' ||
    info.width === 0 ||
    info.height === 0
  ) {
    console.log(`issue reproduced: element is not visible (display=${info.display}, visibility=${info.visibility}, opacity=${info.opacity}, size=${info.width}x${info.height})`);
  } else {
    console.log('issue not reproduced');
  }
} finally {
  await session.close();
}
