import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import WebSocket from 'ws';
import {
  CDP_WEBSOCKET_ENDPOINT_REGEX,
  launch,
  type Process as BrowserProcess,
} from '@puppeteer/browsers';
import { BidiMapper } from 'chromium-bidi';
import { MapperCdpConnection } from 'chromium-bidi/lib/cdp/CdpConnection.js';
import type { BiDiConnection } from '../bidi-connection.js';
import { resolveChromePath } from './resolve.js';
import { WsTransport } from './transport.js';

const { BidiServer } = BidiMapper;

export interface ChromeLaunchInternalOptions {
  chromePath?: string;
  headless?: boolean;
  args?: string[];
}

export class ChromeLauncher {
  private _browserProcess: BrowserProcess | null = null;
  private _cdpWs: WebSocket | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _bidiServer: any = null;

  async launch(connection: BiDiConnection, options: ChromeLaunchInternalOptions = {}): Promise<void> {
    const executablePath = options.chromePath ?? await resolveChromePath();

    const profileDir = await mkdtemp(path.join(os.tmpdir(), 'ff-bidi-chrome-'));

    const chromeArgs: string[] = [
      '--allow-browser-signin=false',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-search-engine-choice-screen',
      '--enable-automation',
      '--no-default-browser-check',
      '--no-first-run',
      '--password-store=basic',
      '--remote-debugging-port=0',
      '--use-mock-keychain',
      `--user-data-dir=${profileDir}`,
    ];
    if (options.headless) chromeArgs.push('--headless=new');
    if (options.args) chromeArgs.push(...options.args);
    chromeArgs.push('about:blank');

    this._browserProcess = launch({ executablePath, args: chromeArgs });

    // waitForLineOutput resolves with match[1] — already the ws:// URL
    const cdpUrl = await this._browserProcess.waitForLineOutput(CDP_WEBSOCKET_ENDPOINT_REGEX, 10_000);

    const cdpWs = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(cdpUrl);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
    this._cdpWs = cdpWs;

    const cdpConnection = new MapperCdpConnection(new WsTransport(cdpWs) as any);
    const browserCdpClient = await cdpConnection.createBrowserSession();

    // BidiTransport bridges BiDiConnection ↔ BidiServer (no WebSocket indirection)
    const bidiTransport = {
      setOnMessage(handler: (msg: any) => void): void {
        connection.connectDirect(handler);
      },
      sendMessage(message: any): void {
        connection.receiveDirect(message);
      },
      close(): void {},
    };

    this._bidiServer = await BidiServer.createAndStart(
      bidiTransport as any,
      cdpConnection as any,
      browserCdpClient as any,
      '' // BidiServer runs in Node.js — no mapper tab self-target to exclude
    );
  }

  async kill(): Promise<void> {
    this._bidiServer?.close();
    this._cdpWs?.close();
    await this._browserProcess?.close();
    this._browserProcess = null;
    this._cdpWs = null;
    this._bidiServer = null;
  }

  isRunning(): boolean {
    return this._browserProcess !== null;
  }
}
