#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const { values, positionals } = parseArgs({
  options: {
    browser:   { type: 'string',  short: 'b' },
    firefox:   { type: 'string',  short: 'f' },
    profile:   { type: 'string',  short: 'p' },
    pref:      { type: 'string',  multiple: true },
    'chrome-path': { type: 'string' },
    'bidi-url':{ type: 'string' },
    headless:  { type: 'boolean', default: false },
    debug:     { type: 'boolean', short: 'd', default: false },
    timeout:   { type: 'string',  short: 't', default: '30000' },
    help:      { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

const [scriptPath] = positionals;

if (values.help || !scriptPath) {
  console.error('Usage: ff-bidi-run <script.mjs> [options]');
  console.error('');
  console.error('Browser selection:');
  console.error('  -b, --browser <browser>   Browser to use: firefox (default) or chrome');
  console.error('');
  console.error('Firefox options:');
  console.error('  -f, --firefox <path>      Path to Firefox binary');
  console.error('  -p, --profile <path>      Path to Firefox profile directory');
  console.error('      --pref <key=value>    Set a Firefox preference (repeatable)');
  console.error('      --headless            Run Firefox in headless mode');
  console.error('');
  console.error('Chrome options:');
  console.error('      --headless             Run Chrome in headless mode');
  console.error('      --chrome-path <path>   Path to Chrome binary (default: system stable Chrome)');
  console.error('      --bidi-url <url>       Connect to an existing BiDi WebSocket URL');
  console.error('');
  console.error('General options:');
  console.error('  -d, --debug               Enable BiDi debug logging');
  console.error('  -t, --timeout <ms>        Script timeout in ms (default: 30000)');
  process.exit(values.help ? 0 : 1);
}

// Parse --pref key=value entries into an object, inferring boolean/number types
const prefs = {};
for (const entry of (values.pref ?? [])) {
  const eq = entry.indexOf('=');
  if (eq === -1) {
    console.error(`Invalid --pref format: "${entry}" (expected key=value)`);
    process.exit(1);
  }
  const key = entry.slice(0, eq);
  const raw = entry.slice(eq + 1);
  const val = raw === 'true' ? true
            : raw === 'false' ? false
            : raw !== '' && !isNaN(Number(raw)) ? Number(raw)
            : raw;
  prefs[key] = val;
}

const env = {
  ...process.env,
  ...(values.browser    && { BIDI_BROWSER:    values.browser }),
  ...(values.firefox    && { FIREFOX_PATH:    values.firefox }),
  ...(values.profile    && { FIREFOX_PROFILE: values.profile }),
  FIREFOX_HEADLESS: (values.browser !== 'chrome' && values.headless) ? '1' : '0',
  CHROME_HEADLESS:  (values.browser === 'chrome'  && values.headless) ? '1' : '0',
  ...(values['chrome-path']        && { CHROME_PATH:         values['chrome-path'] }),
  ...(values['bidi-url'] && { CHROME_BIDI_URL: values['bidi-url'] }),
  ...(values.debug      && { BIDI_DEBUG:      '1' }),
  ...(Object.keys(prefs).length > 0 && { FIREFOX_PREFS: JSON.stringify(prefs) }),
};

const child = spawn(process.execPath, [resolve(scriptPath)], {
  env,
  stdio: 'inherit',
});

const timeoutMs = parseInt(values.timeout, 10);
const watchdog = setTimeout(() => {
  child.kill('SIGTERM');
  console.error(`\nScript timed out after ${timeoutMs}ms`);
  process.exit(1);
}, timeoutMs);
watchdog.unref();

child.on('exit', (code) => {
  clearTimeout(watchdog);
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  clearTimeout(watchdog);
  console.error(`Failed to run script: ${err.message}`);
  process.exit(1);
});
