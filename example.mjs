/**
 * Simple example to test firefox-bidi-client (minimal protocol client)
 */

import { BiDiConnection, FirefoxProcessManager, setLogger, ConsoleLogger } from './dist/index.js';

// Enable logging
setLogger(new ConsoleLogger(true));

const manager = new FirefoxProcessManager();
const connection = new BiDiConnection();

try {
  console.log('\n🧪 Testing firefox-bidi-client (minimal API)\n');

  // Launch Firefox
  const port = await manager.launch({
    headless: true,
    viewport: { width: 1280, height: 720 },
  });
  console.log(`✅ Firefox launched on port ${port}`);

  // Connect to BiDi
  await connection.connect(port);
  console.log('✅ Connected to BiDi');

  // Get browsing context
  const tree = await connection.sendCommand('browsingContext.getTree', {});
  const contextId = tree.contexts[0].context;
  console.log(`✅ Got context ID: ${contextId}`);

  // Navigate
  await connection.sendCommand('browsingContext.navigate', {
    context: contextId,
    url: 'https://example.com',
    wait: 'complete',
  });
  console.log('✅ Navigated to example.com');

  // Execute script
  const result = await connection.sendCommand('script.evaluate', {
    expression: 'document.title',
    target: { context: contextId },
    awaitPromise: false,
  });
  console.log(`✅ Page title: "${result.result.value}"`);

  // Close
  await connection.close();
  await manager.kill();
  console.log('✅ Closed\n');

  console.log('🎉 All tests passed!\n');
} catch (error) {
  console.error('❌ Error:', error);
  await connection.close().catch(() => {});
  await manager.kill().catch(() => {});
  process.exit(1);
}
