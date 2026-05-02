'use client';

import { Logger } from '@/lib/Logger';

// Create a logger for error reporting
const errorLogger = Logger.getLogger('error_reporting');

export interface ErrorReport {
  id: string;
  timestamp: number;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  errorInfo?: {
    componentStack?: string;
  };
  context: {
    component?: string;
    userAgent: string;
    url: string;
    retryCount?: number;
    userId?: string; // Anonymous user ID for tracking
    sessionId?: string;
  };
  metadata?: Record<string, any>;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByComponent: Record<string, number>;
  errorsByType: Record<string, number>;
  recentErrors: ErrorReport[];
}

class ErrorReportingService {
  private static instance: ErrorReportingService;
  private maxStoredErrors = 50;
  private sessionId: string;
  private userId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.userId = this.getOrCreateUserId();
  }

  static getInstance(): ErrorReportingService {
    if (!ErrorReportingService.instance) {
      ErrorReportingService.instance = new ErrorReportingService();
    }
    return ErrorReportingService.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getOrCreateUserId(): string {
    if (typeof window === 'undefined') return 'ssr';
    const key = 'wallet_user_id';
    let userId = localStorage.getItem(key);

    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(key, userId);
    }

    return userId;
  }

  /**
   * Report an error to the error reporting service
   */
  async reportError(
    error: Error,
    context: {
      component?: string;
      retryCount?: number;
      metadata?: Record<string, any>;
    } = {},
    errorInfo?: { componentStack?: string },
  ): Promise<string> {
    const errorId = crypto.randomUUID();

    const report: ErrorReport = {
      id: errorId,
      timestamp: Date.now(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
      context: {
        component: context.component,
        userAgent: navigator.userAgent,
        url: window.location.href,
        retryCount: context.retryCount,
        userId: this.userId,
        sessionId: this.sessionId,
      },
      metadata: context.metadata,
    };

    // Store locally
    await this.storeErrorLocally(report);

    // Log to application logger
    errorLogger.error('Error reported:', {
      id: errorId,
      component: context.component,
      message: error.message,
      retryCount: context.retryCount,
    });

    return errorId;
  }

  /**
   * Store error report locally for debugging and analytics
   */
  private async storeErrorLocally(report: ErrorReport): Promise<void> {
    try {
      const key = 'wallet_error_reports';
      const stored = localStorage.getItem(key);
      const reports: ErrorReport[] = stored ? JSON.parse(stored) : [];

      reports.push(report);

      // Keep only the most recent errors
      if (reports.length > this.maxStoredErrors) {
        reports.splice(0, reports.length - this.maxStoredErrors);
      }

      localStorage.setItem(key, JSON.stringify(reports));
    } catch (storageError) {
      errorLogger.warn('Failed to store error report locally:', storageError);
    }
  }

  /**
   * Get error statistics for analytics
   */
  getErrorStats(): ErrorStats {
    try {
      const key = 'wallet_error_reports';
      const stored = localStorage.getItem(key);
      const reports: ErrorReport[] = stored ? JSON.parse(stored) : [];

      const errorsByComponent: Record<string, number> = {};
      const errorsByType: Record<string, number> = {};

      reports.forEach((report) => {
        // Count by component
        const component = report.context.component || 'Unknown';
        errorsByComponent[component] = (errorsByComponent[component] || 0) + 1;

        // Count by error type
        const errorType = report.error.name || 'Unknown';
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      });

      return {
        totalErrors: reports.length,
        errorsByComponent,
        errorsByType,
        recentErrors: reports.slice(-10), // Last 10 errors
      };
    } catch (error) {
      errorLogger.error('Failed to get error stats:', error);
      return {
        totalErrors: 0,
        errorsByComponent: {},
        errorsByType: {},
        recentErrors: [],
      };
    }
  }

  /**
   * Clear all stored error reports
   */
  clearErrorReports(): void {
    try {
      localStorage.removeItem('wallet_error_reports');
      errorLogger.info('Error reports cleared');
    } catch (error) {
      errorLogger.error('Failed to clear error reports:', error);
    }
  }

  /**
   * Get recent error reports for debugging
   */
  getRecentErrors(count: number = 10): ErrorReport[] {
    try {
      const key = 'wallet_error_reports';
      const stored = localStorage.getItem(key);
      const reports: ErrorReport[] = stored ? JSON.parse(stored) : [];

      return reports.slice(-count);
    } catch (error) {
      errorLogger.error('Failed to get recent errors:', error);
      return [];
    }
  }

  /**
   * Check if an error is a known issue that can be automatically recovered
   */
  isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [/network/i, /timeout/i, /fetch/i, /connection/i, /temporary/i];

    return recoverablePatterns.some(
      (pattern) => pattern.test(error.message) || pattern.test(error.name),
    );
  }

  /**
   * Get suggested recovery actions for an error
   */
  getRecoveryActions(error: Error): string[] {
    const actions: string[] = [];

    if (error.message.includes('network') || error.message.includes('connection')) {
      actions.push('Check your internet connection');
      actions.push('Try refreshing the page');
    }

    if (error.message.includes('storage') || error.message.includes('quota')) {
      actions.push('Clear browser storage');
      actions.push('Free up disk space');
    }

    if (error.message.includes('permission') || error.message.includes('denied')) {
      actions.push('Check browser permissions');
      actions.push('Allow required permissions in browser settings');
    }

    if (error.message.includes('biometric') || error.message.includes('authentication')) {
      actions.push('Re-enable biometric authentication');
      actions.push('Try using password authentication instead');
    }

    if (actions.length === 0) {
      actions.push('Try refreshing the page');
      actions.push('Clear browser cache and cookies');
      actions.push('Update your browser');
    }

    return actions;
  }
}

export const errorReporting = ErrorReportingService.getInstance();
export default ErrorReportingService;
