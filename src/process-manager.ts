/**
 * Firefox Process Manager
 *
 * Handles launching Firefox with BiDi enabled and managing the process lifecycle.
 */

import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync, mkdtempSync, rmSync, writeSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { log, logDebug } from './logger.js';
import type { FirefoxLaunchOptions } from './types.js';

export class FirefoxProcessManager {
  private process: ChildProcess | null = null;
  private debuggingPort: number = 0;
  private logFileFd: number | null = null;
  private profilePath: string | null = null;
  private isTemporaryProfile: boolean = false;

  /**
   * Launch Firefox with BiDi enabled
   * Returns the BiDi WebSocket port number
   */
  async launch(options: FirefoxLaunchOptions): Promise<number> {
    log('🚀 Launching Firefox with BiDi...');

    // Build Firefox command line arguments
    const args = this.buildFirefoxArgs(options);

    // Determine Firefox binary path
    const firefoxBinary = options.firefoxPath || this.getDefaultFirefoxPath();
    logDebug(`Firefox binary: ${firefoxBinary}`);
    logDebug(`Firefox args: ${args.join(' ')}`);

    // Set up environment variables
    const env = {
      ...process.env,
      ...(options.env || {}),
    };

    // Always use 'pipe' for stdio so we can capture BiDi port from stdout/stderr
    const stdio: any = ['ignore', 'pipe', 'pipe'];

    // Open log file if requested (we'll tee the output)
    if (options.logFile) {
      this.logFileFd = openSync(options.logFile, 'a');
      logDebug(`Logging Firefox output to: ${options.logFile}`);
    }

    // Spawn Firefox process
    this.process = spawn(firefoxBinary, args, {
      env,
      stdio,
      detached: false,
    });

    // Handle process events
    this.process.on('error', (error) => {
      logDebug(`Firefox process error: ${error.message}`);
    });

    this.process.on('exit', (code, signal) => {
      logDebug(`Firefox process exited with code ${code}, signal ${signal}`);
      this.process = null;
    });

    // Wait for Firefox to start and BiDi port to be available
    this.debuggingPort = await this.waitForBiDiPort();

    log(`✅ Firefox launched (BiDi port: ${this.debuggingPort})`);
    return this.debuggingPort;
  }

  /**
   * Build Firefox command line arguments
   */
  private buildFirefoxArgs(options: FirefoxLaunchOptions): string[] {
    const args: string[] = [];

    // Prevent Firefox from delegating to an existing running instance
    args.push('--no-remote');

    // Enable remote debugging with BiDi
    // Using port 0 tells Firefox to choose a free port
    args.push('--remote-debugging-port=0');

    // Headless mode
    if (options.headless) {
      args.push('--headless');
    }

    // Window size/viewport
    if (options.viewport) {
      args.push(`--width=${options.viewport.width}`);
      args.push(`--height=${options.viewport.height}`);
    }

    // Profile path - create temporary if not specified
    if (options.profilePath) {
      args.push('--profile', options.profilePath);
      this.profilePath = options.profilePath;
      this.isTemporaryProfile = false;
      logDebug(`Using Firefox profile: ${options.profilePath}`);
    } else {
      // Create temporary profile
      this.profilePath = mkdtempSync(join(tmpdir(), 'firefox-profile-'));
      this.isTemporaryProfile = true;
      args.push('--profile', this.profilePath);
      logDebug(`Created temporary Firefox profile: ${this.profilePath}`);
    }

    // Additional Firefox arguments
    if (options.args && options.args.length > 0) {
      args.push(...options.args);
    }

    return args;
  }

  /**
   * Get default Firefox binary path based on platform
   */
  private getDefaultFirefoxPath(): string {
    const platform = process.platform;

    switch (platform) {
      case 'darwin': // macOS
        return '/Applications/Firefox.app/Contents/MacOS/firefox';
      case 'win32': // Windows
        return 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
      case 'linux':
        return 'firefox';
      default:
        return 'firefox';
    }
  }

  /**
   * Wait for Firefox to start and discover the BiDi port from stdout/stderr
   * Firefox outputs: "WebDriver BiDi listening on ws://127.0.0.1:PORT"
   */
  private async waitForBiDiPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Firefox BiDi port (10 seconds)'));
      }, 10000);

      let stdoutBuffer = '';
      let stderrBuffer = '';

      const checkForPort = (data: string): number | null => {
        // Look for: "WebDriver BiDi listening on ws://127.0.0.1:9222"
        const match = data.match(/WebDriver BiDi listening on ws:\/\/127\.0\.0\.1:(\d+)/i);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
        return null;
      };

      const stdoutHandler = (data: Buffer) => {
        const text = data.toString();
        stdoutBuffer += text;

        // Write to log file if configured
        if (this.logFileFd !== null) {
          try {
            writeSync(this.logFileFd, data);
          } catch (error) {
            logDebug(`Error writing to log file: ${error}`);
          }
        }

        // Also log to debug
        logDebug(`Firefox stdout: ${text.trim()}`);

        const port = checkForPort(stdoutBuffer);
        if (port) {
          clearTimeout(timeout);
          logDebug(`Found BiDi port from stdout: ${port}`);

          // Keep listeners for logging but don't wait for more data
          resolve(port);
        }
      };

      const stderrHandler = (data: Buffer) => {
        const text = data.toString();
        stderrBuffer += text;

        // Write to log file if configured
        if (this.logFileFd !== null) {
          try {
            writeSync(this.logFileFd, data);
          } catch (error) {
            logDebug(`Error writing to log file: ${error}`);
          }
        }

        // Also log to debug
        logDebug(`Firefox stderr: ${text.trim()}`);

        const port = checkForPort(stderrBuffer);
        if (port) {
          clearTimeout(timeout);
          logDebug(`Found BiDi port from stderr: ${port}`);

          // Keep listeners for logging but don't wait for more data
          resolve(port);
        }
      };

      // Listen to stdout and stderr
      if (this.process) {
        this.process.stdout?.on('data', stdoutHandler);
        this.process.stderr?.on('data', stderrHandler);

        // Check if process exits before we find the port
        this.process.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Firefox process exited unexpectedly with code ${code}`));
        });
      } else {
        clearTimeout(timeout);
        reject(new Error('No Firefox process'));
      }
    });
  }

  /**
   * Kill Firefox process
   */
  async kill(): Promise<void> {
    if (this.process) {
      logDebug('Killing Firefox process');

      // Close log file if open
      if (this.logFileFd !== null) {
        try {
          closeSync(this.logFileFd);
        } catch (error) {
          logDebug(`Error closing log file: ${error}`);
        }
        this.logFileFd = null;
      }

      // Kill process
      if (this.process.exitCode === null) {
        this.process.kill('SIGTERM');

        // Wait up to 5 seconds for graceful shutdown
        const killTimeout = setTimeout(() => {
          if (this.process && this.process.exitCode === null) {
            logDebug('Force killing Firefox process');
            this.process.kill('SIGKILL');
          }
        }, 5000);

        // Wait for process to exit
        await new Promise<void>((resolve) => {
          if (!this.process || this.process.exitCode !== null) {
            clearTimeout(killTimeout);
            resolve();
            return;
          }

          this.process.once('exit', () => {
            clearTimeout(killTimeout);
            resolve();
          });
        });
      }

      this.process = null;
    }

    // Clean up temporary profile
    if (this.isTemporaryProfile && this.profilePath) {
      try {
        logDebug(`Cleaning up temporary profile: ${this.profilePath}`);
        rmSync(this.profilePath, { recursive: true, force: true });
      } catch (error) {
        logDebug(`Error cleaning up temporary profile: ${error}`);
      }
      this.profilePath = null;
      this.isTemporaryProfile = false;
    }

    this.debuggingPort = 0;
  }

  /**
   * Check if Firefox process is running
   */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get the BiDi port number
   */
  getPort(): number {
    return this.debuggingPort;
  }
}
