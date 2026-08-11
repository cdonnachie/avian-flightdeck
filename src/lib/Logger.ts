/**
 * Generic Logger utility
 * This replaces browser console statements with a proper logging system that
 * respects the ESLint no-console rule and provides consistent logging across the application.
 */

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  args: any[];
}

export class Logger {
  private static instances: Map<string, Logger> = new Map();
  private readonly MAX_LOG_ENTRIES: number;
  private readonly STORAGE_KEY: string;
  private debugEnabled: boolean = false;

  /**
   * Private constructor to enforce factory pattern
   */
  private constructor(module: string, options?: { maxEntries?: number }) {
    this.STORAGE_KEY = `avian_${module}_logs`;
    this.MAX_LOG_ENTRIES = options?.maxEntries || 100;

    // Initialize debug state from storage if available
    if (typeof window !== 'undefined') {
      this.debugEnabled = localStorage.getItem(`${module}_debug_enabled`) === 'true';
    }
  }

  /**
   * Get or create a logger instance for the specified module
   */
  public static getLogger(module: string, options?: { maxEntries?: number }): Logger {
    const normalizedModule = module.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Use options from parameters or default to 500 entries
    const loggerOptions = { maxEntries: options?.maxEntries ?? 500 };

    if (!Logger.instances.has(normalizedModule)) {
      Logger.instances.set(normalizedModule, new Logger(normalizedModule, loggerOptions));
    }

    return Logger.instances.get(normalizedModule)!;
  }

  /**
   * Enable or disable debug logging
   */
  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (typeof window !== 'undefined') {
      const key = this.STORAGE_KEY.replace('avian_', '').replace('_logs', '');
      localStorage.setItem(`${key}_debug_enabled`, enabled ? 'true' : 'false');
    }
  }

  /**
   * Check if debug logging is enabled
   */
  public isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Log an informational message
   */
  public info(message: string, ...args: any[]): void {
    this.logToStorage('INFO', message, args);
  }

  /**
   * Log debug information (only if debug is enabled)
   */
  public debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      this.logToStorage('DEBUG', message, args);
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    // Warnings are always logged
    this.logToStorage('WARN', message, args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    // Errors are always logged
    this.logToStorage('ERROR', message, args);
  }

  /**
   * Get all logs from storage
   */
  public getLogs(): LogEntry[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const logsJson = localStorage.getItem(this.STORAGE_KEY);
      if (logsJson) {
        return JSON.parse(logsJson);
      }
    } catch (e) {
      // Silent fail - we can't use browser console due to ESLint rules
    }
    return [];
  }

  /**
   * Clear all logs from storage
   */
  public clearLogs(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (e) {
        // Silent fail - we can't use browser console due to ESLint rules
      }
    }
  }

  /**
   * Log a message to storage
   */
  private logToStorage(level: string, message: string, args: any[] = []): void {
    try {
      if (typeof window === 'undefined') {
        // Server-side logging could be implemented here
        return;
      }

      const logs = this.getLogs();
      logs.push({
        timestamp: Date.now(),
        level,
        message,
        args: args.map((arg) => {
          if (arg instanceof Error) {
            return {
              name: arg.name,
              message: arg.message,
              stack: arg.stack,
            };
          }
          return arg;
        }),
      });

      // Trim logs if they exceed maximum
      if (logs.length > this.MAX_LOG_ENTRIES) {
        logs.splice(0, logs.length - this.MAX_LOG_ENTRIES);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      // Silent fail - we can't use browser console due to ESLint rules
    }
  }
}

// Create convenience exports for common loggers
export const walletLogger = Logger.getLogger('wallet', { maxEntries: 500 });
export const notificationLogger = Logger.getLogger('notification');
export const securityLogger = Logger.getLogger('security');
export const storageLogger = Logger.getLogger('storage');
export const electrumLogger = Logger.getLogger('electrum');
export const priceLogger = Logger.getLogger('price');
export const watchAddressLogger = Logger.getLogger('watch_address');
export const termsLogger = Logger.getLogger('terms');
export const walletContextLogger = Logger.getLogger('wallet_context');
export const routeGuardLogger = Logger.getLogger('route_guard');
export const dataWipeLogger = Logger.getLogger('data_wipe');
export const providerLogger = Logger.getLogger('provider');
