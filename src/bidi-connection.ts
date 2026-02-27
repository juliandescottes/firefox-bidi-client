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
  private connected: boolean = false;
  private options: BiDiConnectionOptions;

  constructor(options: BiDiConnectionOptions = {}) {
    this.options = {
      connectionTimeout: options.connectionTimeout || 5000,
      commandTimeout: options.commandTimeout || 10000,
    };
  }

  /**
   * Connect to Firefox BiDi WebSocket endpoint
   */
  async connect(port: number): Promise<void> {
    logDebug(`Attempting to connect to BiDi on port ${port}`);

    // Try multiple endpoints
    // Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues
    const endpoints = [
      `ws://127.0.0.1:${port}`,
      `ws://127.0.0.1:${port}/session`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        await this.connectToEndpoint(endpoint);
        log(`✅ Connected to Firefox BiDi at ${endpoint}`);
        this.connected = true;

        // Create a BiDi session
        try {
          await this.sendCommand('session.new', { capabilities: {} });
          logDebug('BiDi session established');
        } catch (sessionError) {
          // Some BiDi endpoints (like /session) already have a session
          logDebug(`Session already exists or not needed: ${sessionError}`);
        }

        return;
      } catch (error) {
        lastError = error as Error;
        logDebug(`Failed to connect to ${endpoint}: ${lastError.message}`);
      }
    }

    // All endpoints failed
    throw new Error(
      `Failed to connect to Firefox on port ${port}.\n\n` +
      `Make sure Firefox is running with remote debugging enabled:\n` +
      `  firefox --remote-debugging-port=${port}\n\n` +
      `Or on macOS:\n` +
      `  /Applications/Firefox.app/Contents/MacOS/firefox --remote-debugging-port=${port}\n\n` +
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
    }
  }

  /**
   * Send BiDi command and wait for response
   */
  async sendCommand(method: string, params: any = {}): Promise<any> {
    if (!this.ws) {
      throw new Error('Not connected to Firefox BiDi');
    }

    // Wait for WebSocket to be ready
    if (this.ws.readyState === WebSocket.CONNECTING) {
      await this.waitForWebSocketOpen();
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Firefox BiDi');
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`BiDi command timeout: ${method}`));
      }, this.options.commandTimeout);

      this.pendingCommands.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
        method,
      });

      const command = {
        id,
        method,
        params,
      };

      logDebug(`→ BiDi command: ${method}`);
      this.ws!.send(JSON.stringify(command));
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
   * Register event handler
   */
  on(event: 'message' | 'close' | 'error', handler: EventHandler): void {
    if (event === 'message') {
      this.eventHandlers.add(handler);
    } else if (this.ws) {
      this.ws.on(event, handler);
    }
  }

  /**
   * Remove event handler
   */
  off(event: 'message', handler: EventHandler): void {
    if (event === 'message') {
      this.eventHandlers.delete(handler);
    }
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
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Wait for WebSocket to be in OPEN state
   */
  private async waitForWebSocketOpen(): Promise<void> {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket to open'));
      }, this.options.connectionTimeout!);

      const checkState = () => {
        if (this.ws!.readyState === WebSocket.OPEN) {
          clearTimeout(timeout);
          resolve();
        } else if (this.ws!.readyState === WebSocket.CLOSED || this.ws!.readyState === WebSocket.CLOSING) {
          clearTimeout(timeout);
          reject(new Error('WebSocket closed while waiting'));
        }
      };

      this.ws!.once('open', checkState);
      checkState(); // Check immediately in case it's already open
    });
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.ws) {
      logDebug('Closing BiDi WebSocket connection');

      // Clear all pending commands
      for (const [id, pending] of this.pendingCommands.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection closing'));
      }
      this.pendingCommands.clear();

      // Clear event handlers
      this.eventHandlers.clear();

      // Close WebSocket
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }

      this.ws = null;
      this.connected = false;
    }
  }
}
