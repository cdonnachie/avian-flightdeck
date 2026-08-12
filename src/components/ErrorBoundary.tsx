'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storageLogger } from '@/lib/Logger';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { errorReporting } from '@/services/ErrorReportingService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // Whether this boundary isolates a specific component
  name?: string; // Name for logging purposes
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: crypto.randomUUID(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = crypto.randomUUID();

    // Log error details
    this.logError(error, errorInfo, errorId);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
      errorId,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report to error tracking service
    this.reportError(error, errorInfo, errorId);
  }

  private logError = (error: Error, errorInfo: ErrorInfo, errorId: string) => {
    const errorData = {
      errorId,
      name: this.props.name || 'Unknown Component',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      retryCount: this.state.retryCount,
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.group(`🚨 Error Boundary: ${this.props.name || 'Component Error'}`);
      // eslint-disable-next-line no-console
      console.error('Error:', error);
      // eslint-disable-next-line no-console
      console.error('Error Info:', errorInfo);
      // eslint-disable-next-line no-console
      console.error('Error Data:', errorData);
      // eslint-disable-next-line no-console
      console.groupEnd();
    }

    // Store error in localStorage for debugging
    try {
      const storedErrors = JSON.parse(localStorage.getItem('wallet_errors') || '[]');
      storedErrors.push(errorData);

      // Keep only last 10 errors
      if (storedErrors.length > 10) {
        storedErrors.splice(0, storedErrors.length - 10);
      }

      localStorage.setItem('wallet_errors', JSON.stringify(storedErrors));
    } catch (storageError) {
      // eslint-disable-next-line no-console
      console.warn('Failed to store error in localStorage:', storageError);
    }
  };

  private reportError = async (error: Error, errorInfo: ErrorInfo, errorId: string) => {
    try {
      await errorReporting.reportError(
        error,
        {
          component: this.props.name,
          retryCount: this.state.retryCount,
          metadata: {
            isolate: this.props.isolate,
            hasCustomFallback: !!this.props.fallback,
            errorId,
          },
        },
        {
          componentStack: errorInfo.componentStack || undefined,
        },
      );
    } catch (reportError) {
      // eslint-disable-next-line no-console
      console.warn('Failed to report error via ErrorReportingService:', reportError);
    }
  };

  private handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState((prevState) => ({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: prevState.retryCount + 1,
      }));
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
    });
  };

  private handleCopyError = async () => {
    if (!this.state.error || !this.state.errorInfo) return;

    const errorText = `
Error ID: ${this.state.errorId}
Component: ${this.props.name || 'Unknown'}
Error: ${this.state.error.message}
Stack: ${this.state.error.stack}
Component Stack: ${this.state.errorInfo.componentStack}
Timestamp: ${new Date().toISOString()}
        `.trim();

    try {
      await navigator.clipboard.writeText(errorText);
      // Could show a toast here
      storageLogger.info('Error details copied to clipboard');
    } catch (copyError) {
      storageLogger.warn('Failed to copy error details:', copyError);
    }
  };

  private navigateHome = () => {
    // Clear error state and navigate to home
    this.handleReset();
    window.location.href = '/';
  };

  private reloadPage = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI provided by parent
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40 dark:bg-card">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-destructive/10 p-3">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-xl text-destructive">
                {this.props.isolate ? 'Component Error' : 'Application Error'}
              </CardTitle>
              <CardDescription>
                {this.props.isolate
                  ? 'A component has encountered an error and stopped working.'
                  : 'The application has encountered an unexpected error.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {this.state.errorId && (
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertTitle>Error Details</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Error ID:</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {this.state.errorId.slice(0, 8)}
                        </Badge>
                      </div>
                      {this.props.name && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Component:</span>
                          <Badge variant="outline">{this.props.name}</Badge>
                        </div>
                      )}
                      {this.state.retryCount > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Retry attempts:</span>
                          <Badge variant="outline">{this.state.retryCount}</Badge>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <Alert className="border-caution/30 bg-caution/10 dark:border-caution/30 dark:bg-caution/10">
                  <AlertTriangle className="h-4 w-4 text-caution" />
                  <AlertTitle className="text-caution">
                    Development Error Details
                  </AlertTitle>
                  <AlertDescription className="text-caution">
                    <div className="space-y-2 mt-2">
                      <div>
                        <strong>Error:</strong> {this.state.error.message}
                      </div>
                      {this.state.error.stack && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-medium">
                            Stack Trace
                          </summary>
                          <pre className="mt-2 text-xs bg-caution/10 p-2 rounded overflow-x-auto">
                            {this.state.error.stack}
                          </pre>
                        </details>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 justify-center">
                {this.state.retryCount < this.maxRetries && (
                  <Button
                    onClick={this.handleRetry}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again ({this.maxRetries - this.state.retryCount} left)
                  </Button>
                )}

                <Button
                  onClick={this.navigateHome}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>

                <Button
                  onClick={this.reloadPage}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </Button>

                {this.state.error && (
                  <Button
                    onClick={this.handleCopyError}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Error
                  </Button>
                )}
              </div>

              <Separator />

              <div className="text-center text-sm text-muted-foreground">
                <p>
                  If this error persists, please check the browser console for more details
                  {this.state.errorId && (
                    <span>
                      {' '}
                      or report this error with ID:{' '}
                      <code className="bg-muted/40 dark:bg-card px-1 rounded">
                        {this.state.errorId.slice(0, 8)}
                      </code>
                    </span>
                  )}
                </p>
              </div>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundary for wallet operations
export class WalletErrorBoundary extends ErrorBoundary {
  constructor(props: Props) {
    super(props);
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Handle wallet-specific error logging first
    this.handleWalletError(error, errorInfo);

    // Then call parent componentDidCatch
    super.componentDidCatch(error, errorInfo);
  }

  private handleWalletError = (error: Error, errorInfo: ErrorInfo) => {
    // Log wallet-specific error context
    // eslint-disable-next-line no-console
    console.group('🔑 Wallet Error Boundary');
    // eslint-disable-next-line no-console
    console.error('Wallet operation failed:', error.message);
    // eslint-disable-next-line no-console
    console.error('Component stack:', errorInfo.componentStack);

    // Check if it's a security-related error
    if (
      error.message.includes('authentication') ||
      error.message.includes('biometric') ||
      error.message.includes('password')
    ) {
      // eslint-disable-next-line no-console
      console.warn('Security-related error detected');
    }

    // Check if it's a network/electrum error
    if (
      error.message.includes('network') ||
      error.message.includes('electrum') ||
      error.message.includes('connection')
    ) {
      // eslint-disable-next-line no-console
      console.warn('Network-related error detected');
    }

    // eslint-disable-next-line no-console
    console.groupEnd();
  };
}

// Higher-order component for easy error boundary wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

export default ErrorBoundary;
