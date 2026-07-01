import os from 'node:os';
import path from 'node:path';
import {
  Browser,
  BrowserTag,
  ChromeReleaseChannel,
  computeExecutablePath,
  computeSystemExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} from '@puppeteer/browsers';

function getCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'ff-bidi-client');
}

/** Resolves the stable system Chrome, downloading it if not present. */
export async function resolveChromePath(): Promise<string> {
  try {
    return computeSystemExecutablePath({
      browser: Browser.CHROME,
      channel: ChromeReleaseChannel.STABLE,
    });
  } catch { /* not installed */ }

  const platform = detectBrowserPlatform();
  if (!platform) throw new Error('Unsupported platform for Chrome auto-setup');

  const cacheDir = getCacheDir();
  const buildId = await resolveBuildId(Browser.CHROME, platform, BrowserTag.STABLE);
  const installed = await getInstalledBrowsers({ cacheDir });
  if (!installed.some(b => b.browser === Browser.CHROME && b.buildId === buildId)) {
    console.error(`Downloading Chrome ${buildId}...`);
    await install({ browser: Browser.CHROME, buildId, cacheDir, downloadProgressCallback: 'default' });
  }
  return computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir });
}
