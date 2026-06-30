/**
 * Repro: latale.com event page — interactive UI not displayed in Firefox
 * Report: https://www.latale.com/event/2026/2q-main1/main
 *
 * Observed: ~50 <div> children of <main> carry background images but remain
 * invisible after load — negative Y offsets (-87, -70, -33 …) and/or opacity 0.
 * The intro animation that should reveal them never fires in Firefox.
 * Console errors are only unrelated third-party cookie rejections (not the cause).
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://www.latale.com/event/2026/2q-main1/main';

// After the intro animation, all content divs should be at opacity 1.
// Any div still at opacity 0 is stuck in its pre-animation state — that is the bug.
const VISIBILITY_CHECK = `(() => {
  const main = document.querySelector('main');
  if (!main) return { mainFound: false };

  const divs = Array.from(main.querySelectorAll(':scope > div'));
  const stuck = divs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.01);

  return {
    mainFound:  true,
    total:      divs.length,
    stuckCount: stuck.length,
    stuckSizes: stuck.map(el => Math.round(el.getBoundingClientRect().height)),
  };
})()`;

const session = await startSession();
const { page } = session;

try {
  await page.goto(TARGET_URL);

  // Wait for the content container, then let the intro animation window elapse.
  await page.waitForSelector('main > div');
  await new Promise(r => setTimeout(r, 4000));

  const result = await page.evaluate(VISIBILITY_CHECK);

  if (!result.mainFound) {
    console.log('issue not reproduced: <main> element not found');
  } else if (result.total === 0) {
    console.log('issue not reproduced: <main> has no <div> children');
  } else if (result.stuckCount > 0) {
    console.log(
      `issue reproduced: ${result.stuckCount}/${result.total} divs stuck at opacity 0 ` +
      `after animation window (heights: ${JSON.stringify(result.stuckSizes)})`
    );
    await page.screenshot({ path: 'repro-latale.png' });
    console.log('  screenshot saved to repro-latale.png');
  } else {
    console.log(`issue not reproduced: all ${result.total} divs have opacity > 0`);
  }
} finally {
  await session.close();
}
