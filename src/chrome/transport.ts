import WebSocket from 'ws';

/** Adapts a WebSocket to chromium-bidi's raw-string Transport interface (used for CDP). */
export class WsTransport {
  #onMessage?: (data: string) => void;

  constructor(private readonly _ws: WebSocket) {
    _ws.on('message', (data) => this.#onMessage?.(data.toString()));
  }

  setOnMessage(handler: (data: string) => void): void {
    this.#onMessage = handler;
  }

  sendMessage(message: string): void {
    this._ws.send(message);
  }

  close(): void {
    this._ws.close();
  }
}
