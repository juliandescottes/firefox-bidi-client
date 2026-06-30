/**
 * Webcompat repro pattern: network request failures (CORS, 4xx, 5xx, fetch errors)
 *
 * Use this when you observed: a failed fetch in DevTools, a CORS error in the
 * console, missing content that should have loaded from an API, or a red request
 * in the network panel.
 *
 * Adjust TARGET_URL and optionally FILTER_URL to narrow results to a specific
 * endpoint you identified.
 * Run: ff-bidi-run examples/check-network-errors.mjs --firefox /path/to/firefox --headless
 */
import { startSession } from 'ff-test-firefox-bidi-client';

const TARGET_URL = 'https://example.com';

// Optional: only report failures for URLs containing this string.
// Set to '' to report all failures.
const FILTER_URL = '';

const session = await startSession();
const { page, connection } = session;

const failures = [];

connection.onEvent('network.fetchError', params => {
  const url = params.request.url;
  if (!FILTER_URL || url.includes(FILTER_URL)) {
    failures.push({ type: 'fetchError', url, error: params.errorText });
  }
});

connection.onEvent('network.responseCompleted', params => {
  const url = params.request.url;
  const status = params.response.status;
  if (status >= 400 && (!FILTER_URL || url.includes(FILTER_URL))) {
    failures.push({ type: 'httpError', url, status });
  }
});

// Subscribe before navigating so no events are missed
await connection.subscribe(['network.fetchError', 'network.responseCompleted']);

try {
  await page.goto(TARGET_URL);

  // Allow async requests triggered after load to complete
  await new Promise(r => setTimeout(r, 2000));

  if (failures.length > 0) {
    console.log('issue reproduced:');
    for (const f of failures) {
      if (f.type === 'fetchError') console.log(`  [fetch error] ${f.url} — ${f.error}`);
      if (f.type === 'httpError')  console.log(`  [${f.status}] ${f.url}`);
    }
  } else {
    console.log('issue not reproduced');
  }
} finally {
  await session.close();
}
