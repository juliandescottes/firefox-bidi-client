/**
 * WebDriver BiDi WebSocket Connection
 *
 * Handles direct WebSocket connection to Firefox's BiDi protocol endpoint.
 */

import WebSocket from 'ws';
import { log, logDebug } from './logger.js';
import type { BiDiConnectionOptions, PendingCommand, EventHandler } from './types.js';

export class BiDiConnection {
  private ws: WebSocket | null = null;
  private nextId: number = 1;
  private pendingCommands: Map<number, PendingCommand> = new Map();
  private eventHandlers: Set<EventHandler> = new Set();
  private namedEventHandlers: Map<string, Set<(params: any) => void>> = new Map();
  private connected: boolean = false;
  private options: BiDiConnectionOptions;
  private _directSend: ((msg: object) => void) | null = null;

  constructor(options: BiDiConnectionOptions = {}) {
    this.options = {
      connectionTimeout: options.connectionTimeout || 5000,
      commandTimeout: options.commandTimeout || 20000,
    };
  }

  /**
   * Wire the connection directly to an in-process BiDi server (no WebSocket).
   * sendFn receives outgoing BiDi commands as parsed objects.
   * Call receiveDirect() to inject incoming messages from the server.
   */
  connectDirect(sendFn: (msg: object) => void): void {
    this._directSend = sendFn;
    this.connected = true;
  }

  receiveDirect(message: object): void {
    this.handleMessage(message);
  }

  /**
   * Connect to a browser BiDi WebSocket endpoint.
   * Pass a port number (Firefox) or a full WebSocket URL (Chrome).
   */
  async connect(portOrUrl: number | string): Promise<void> {
    logDebug(`Attempting to connect to BiDi on ${portOrUrl}`);

    // Chrome provides a full URL; Firefox just needs the port
    const endpoints = typeof portOrUrl === 'string'
      ? [portOrUrl]
      : [
          `ws://127.0.0.1:${portOrUrl}`,
          `ws://127.0.0.1:${portOrUrl}/session`,
        ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        await this.connectToEndpoint(endpoint);
        log(`✅ Connected to BiDi at ${endpoint}`);
        this.connected = true;
        return;
      } catch (error) {
        lastError = error as Error;
        logDebug(`Failed to connect to ${endpoint}: ${lastError.message}`);
      }
    }

    // All endpoints failed
    throw new Error(
      `Failed to connect to browser BiDi at ${portOrUrl}.\n` +
      `Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Try to connect to a specific WebSocket endpoint
   */
  private async connectToEndpoint(endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(endpoint);
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutId);
        ws.removeAllListeners();
      };

      timeoutId = setTimeout(() => {
        cleanup();
        ws.close();
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout);

      ws.on('open', () => {
        cleanup();
        this.ws = ws;
        this.setupWebSocketHandlers();
        resolve();
      });

      ws.on('error', (error) => {
        cleanup();
        logDebug(`WebSocket error for ${endpoint}: ${error.message || String(error)}`);
        reject(error);
      });
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        logDebug(`Failed to parse BiDi message: ${error}`);
      }
    });

    this.ws.on('close', () => {
      logDebug('BiDi WebSocket closed');
      this.connected = false;
      this.ws = null;

      // Reject all pending commands
      for (const [id, pending] of this.pendingCommands.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('WebSocket closed'));
      }
      this.pendingCommands.clear();
    });

    this.ws.on('error', (error) => {
      logDebug(`BiDi WebSocket error: ${error.message}`);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: any): void {
    // Command response (has 'id' field)
    if (message.id !== undefined) {
      const pending = this.pendingCommands.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(`BiDi error in ${pending.method}: ${JSON.stringify(message.error)}`)
          );
        } else {
          logDebug(`← BiDi result: ${pending.method} ${JSON.stringify(message.result || {})}`);
          pending.resolve(message.result || {});
        }
      }
      return;
    }

    // Event (no 'id' field, has 'method' field)
    if (message.method) {
      logDebug(`BiDi event: ${message.method}`);
      for (const handler of this.eventHandlers) {
        try {
          handler(message);
        } catch (error) {
          logDebug(`Error in event handler: ${error}`);
        }
      }
      const named = this.namedEventHandlers.get(message.method);
      if (named) {
        for (const handler of named) {
          try {
            handler(message.params);
          } catch (error) {
            logDebug(`Error in named event handler for ${message.method}: ${error}`);
          }
        }
      }
    }
  }

  /**
   * Send BiDi command and wait for response
   */
  async sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this._directSend) {
      if (!this.ws) {
        throw new Error('Not connected to browser BiDi');
      }
      if (this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to browser BiDi');
      }
    }

    const id = this.nextId++;
    const command = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`BiDi command timeout: ${method}`));
      }, this.options.commandTimeout);

      this.pendingCommands.set(id, { resolve, reject, timeout: timeoutId, method });

      if (this._directSend) {
        logDebug(`→ BiDi command (direct): ${method} ${JSON.stringify(params)}`);
        this._directSend(command);
      } else {
        logDebug(`→ BiDi command: ${method} ${JSON.stringify(params)}`);
        this.ws!.send(JSON.stringify(command));
      }
    });
  }

  /**
   * Subscribe to BiDi events
   */
  async subscribe(events: string[], contexts?: string[]): Promise<void> {
    const params: any = { events };
    if (contexts) {
      params.contexts = contexts;
    }

    await this.sendCommand('session.subscribe', params);
    logDebug(`Subscribed to events: ${events.join(', ')}`);
  }

  /**
   * Register a handler for raw WebSocket-level events ('message', 'close', 'error').
   * For BiDi protocol events use onEvent() instead.
   */
  on(event: 'message' | 'close' | 'error', handler: EventHandler): void {
    if (event === 'message') {
      this.eventHandlers.add(handler);
    } else if (this.ws) {
      this.ws.on(event, handler);
    }
  }

  /**
   * Remove a raw event handler registered with on().
   */
  off(event: 'message', handler: EventHandler): void {
    if (event === 'message') {
      this.eventHandlers.delete(handler);
    }
  }

  /**
   * Register a handler for a specific BiDi event method (e.g. 'log.entryAdded').
   * The handler receives event.params directly.
   * Remember to call subscribe() for the event type before expecting events.
   */
  onEvent(method: string, handler: (params: any) => void): void {
    if (!this.namedEventHandlers.has(method)) {
      this.namedEventHandlers.set(method, new Set());
    }
    this.namedEventHandlers.get(method)!.add(handler);
  }

  /**
   * Remove a handler registered with onEvent().
   */
  offEvent(method: string, handler: (params: any) => void): void {
    this.namedEventHandlers.get(method)?.delete(handler);
  }

  /**
   * Get underlying WebSocket (for compatibility)
   */
  get socket(): WebSocket | null {
    return this.ws;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    if (this._directSend) return this.connected;
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this._directSend) {
      logDebug('Closing BiDi direct connection');
      for (const [, pending] of this.pendingCommands.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection closing'));
      }
      this.pendingCommands.clear();
      this.eventHandlers.clear();
      this.namedEventHandlers.clear();
      this._directSend = null;
      this.connected = false;
      return;
    }

    if (this.ws) {
      logDebug('Closing BiDi WebSocket connection');

      // Clear all pending commands
      for (const [, pending] of this.pendingCommands.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection closing'));
      }
      this.pendingCommands.clear();

      // Clear event handlers
      this.eventHandlers.clear();
      this.namedEventHandlers.clear();

      // Close WebSocket
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }

      this.ws = null;
      this.connected = false;
    }
  }
}
