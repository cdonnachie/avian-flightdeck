'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  RotateCcw,
  Bug,
} from 'lucide-react';
import {
  Logger,
  LogEntry,
  walletLogger,
  notificationLogger,
  securityLogger,
  storageLogger,
  electrumLogger,
  priceLogger,
  watchAddressLogger,
} from '@/lib/Logger';
import { errorReporting, ErrorReport } from '@/services/ErrorReportingService';
import { securityService } from '@/services/core/SecurityService';
import { useMediaQuery } from '@/hooks/use-media-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Map of logger names to their instances
const loggerMap: Record<string, Logger | null> = {
  all: null, // Special case for all loggers combined
  wallet: walletLogger,
  notification: notificationLogger,
  security: securityLogger,
  storage: storageLogger,
  electrum: electrumLogger,
  price: priceLogger,
  watch_address: watchAddressLogger,
  backup_service: Logger.getLogger('backup_service'),
  qr_backup: Logger.getLogger('qr_backup'),
  error_reporting: Logger.getLogger('error_reporting'),
  error_boundaries: null, // Special case for error boundary reports
  security_audit: null, // Special case for security audit log (read-only)
};

// Convert error reports to log entry format for consistent display
const convertErrorReportsToLogEntries = (reports: ErrorReport[]): LogEntry[] => {
  return reports.map((report) => ({
    timestamp: report.timestamp,
    level: 'ERROR' as const,
    message: `${report.error.name}: ${report.error.message}`,
    args: [
      {
        errorId: report.id,
        component: report.context.component,
        retryCount: report.context.retryCount,
        stack: report.error.stack,
        componentStack: report.errorInfo?.componentStack,
        userAgent: report.context.userAgent,
        url: report.context.url,
        userId: report.context.userId,
        sessionId: report.context.sessionId,
        metadata: report.metadata,
      },
    ],
  }));
};

// Convert security audit entries to log entry format for consistent display
const convertSecurityAuditToLogEntries = (auditEntries: any[]): LogEntry[] => {
  return auditEntries.map((entry) => ({
    timestamp: entry.timestamp,
    level: entry.success ? ('INFO' as const) : ('ERROR' as const),
    message: `Security Event: ${entry.action.replace('_', ' ')}`,
    args: [
      {
        auditId: entry.id,
        action: entry.action,
        success: entry.success,
        details: entry.details,
        userAgent: entry.userAgent,
        ipAddress: entry.ipAddress,
      },
    ],
  }));
};

export function LogViewer({ isOpen, onClose }: LogViewerProps) {
  const [selectedLoggerName, setSelectedLoggerName] = useState<string>('all');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilters, setLevelFilters] = useState({
    INFO: true,
    DEBUG: true,
    WARN: true,
    ERROR: true,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(
    loggerMap[selectedLoggerName]?.isDebugEnabled() || false,
  );
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 640px)');

  const applyFilters = useCallback(
    (logEntries: LogEntry[], searchText: string, levels: typeof levelFilters) => {
      // Create a copy of the logs and ensure they're sorted by timestamp (newest first)
      let filtered = [...logEntries].sort((a, b) => b.timestamp - a.timestamp);

      // Apply level filters
      filtered = filtered.filter((log) => levels[log.level as keyof typeof levels]);

      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        filtered = filtered.filter((log) => {
          const messageMatch = log.message.toLowerCase().includes(searchLower);
          const argsMatch = JSON.stringify(log.args).toLowerCase().includes(searchLower);
          const loggerMatch =
            'loggerName' in log
              ? (log as any).loggerName.toLowerCase().includes(searchLower)
              : false;

          return messageMatch || argsMatch || loggerMatch;
        });
      }

      setFilteredLogs(filtered);
    },
    [],
  );

  const fetchLogs = useCallback(async () => {
    if (selectedLoggerName === 'all') {
      let allLogs: LogEntry[] = [];

      Object.entries(loggerMap).forEach(([name, logger]) => {
        if (name !== 'all' && name !== 'error_boundaries' && name !== 'security_audit' && logger) {
          const loggerEntries = logger.getLogs().map((log) => ({
            ...log,
            loggerName: name,
          }));
          allLogs = [...allLogs, ...loggerEntries];
        }
      });

      const errorReports = errorReporting.getRecentErrors(50);
      const errorLogEntries = convertErrorReportsToLogEntries(errorReports).map((log) => ({
        ...log,
        loggerName: 'error_boundaries',
      }));
      allLogs = [...allLogs, ...errorLogEntries];

      try {
        const securityAuditEntries = await securityService.getSecurityAuditLog();
        const auditLogEntries = convertSecurityAuditToLogEntries(securityAuditEntries).map(
          (log) => ({
            ...log,
            loggerName: 'security_audit',
          }),
        );
        allLogs = [...allLogs, ...auditLogEntries];
      } catch (error) {
        // Note: Using Logger here would create circular dependency, so we silently fail
      }

      allLogs.sort((a, b) => b.timestamp - a.timestamp);

      setLogs(allLogs);
    } else if (selectedLoggerName === 'error_boundaries') {
      const errorReports = errorReporting.getRecentErrors(50);
      const logEntries = convertErrorReportsToLogEntries(errorReports).sort(
        (a, b) => b.timestamp - a.timestamp,
      );

      setLogs(logEntries);
    } else if (selectedLoggerName === 'security_audit') {
      try {
        const securityAuditEntries = await securityService.getSecurityAuditLog();
        const logEntries = convertSecurityAuditToLogEntries(securityAuditEntries).sort(
          (a, b) => b.timestamp - a.timestamp,
        );

        setLogs(logEntries);
      } catch (error) {
        // Note: Using Logger here would create circular dependency, so we silently fail
        setLogs([]);
      }
    } else {
      const logger = loggerMap[selectedLoggerName];
      if (logger) {
        const logEntries = logger.getLogs().sort((a, b) => b.timestamp - a.timestamp);

        setLogs(logEntries);
      }
    }
  }, [selectedLoggerName]);

  useEffect(() => {
    applyFilters(logs, filter, levelFilters);
  }, [filter, levelFilters, logs, applyFilters]);

  useEffect(() => {
    setFilter('');

    if (
      selectedLoggerName !== 'all' &&
      selectedLoggerName !== 'error_boundaries' &&
      selectedLoggerName !== 'security_audit' &&
      loggerMap[selectedLoggerName]
    ) {
      setIsDebugEnabled(loggerMap[selectedLoggerName]?.isDebugEnabled() || false);
    } else {
      setIsDebugEnabled(false);
    }

    fetchLogs();
  }, [selectedLoggerName, fetchLogs]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (autoRefresh && isOpen) {
      intervalId = setInterval(fetchLogs, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, isOpen, selectedLoggerName, fetchLogs]);

  const handleClearLogs = () => {
    setClearDialogOpen(true);
  };

  const confirmClearLogs = () => {
    if (selectedLoggerName === 'all') {
      Object.entries(loggerMap).forEach(([name, logger]) => {
        if (name !== 'all' && name !== 'error_boundaries' && name !== 'security_audit' && logger) {
          logger.clearLogs();
        }
      });
      errorReporting.clearErrorReports();
      // Note: Security audit log cannot be cleared from here - must be done from Security Settings
    } else if (selectedLoggerName === 'error_boundaries') {
      errorReporting.clearErrorReports();
    } else if (selectedLoggerName === 'security_audit') {
      // Security audit log cannot be cleared from LogViewer
      // This should not happen as the clear button should be disabled
      return;
    } else {
      // Clear logs from the selected logger
      const logger = loggerMap[selectedLoggerName];
      if (logger) {
        logger.clearLogs();
      }
    }

    // Reset the displayed logs
    setLogs([]);
    setFilteredLogs([]);
  };

  // Download logs as JSON file
  const handleDownloadLogs = () => {
    try {
      const logData = JSON.stringify(logs, null, 2);
      const blob = new Blob([logData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedLoggerName}-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Can't use logger here to avoid circular dependency
      alert('Failed to download logs');
    }
  };

  // Toggle debug mode for the selected logger
  const handleToggleDebugMode = () => {
    const logger = loggerMap[selectedLoggerName];
    if (logger && selectedLoggerName !== 'all' && selectedLoggerName !== 'error_boundaries') {
      const newDebugState = !isDebugEnabled;
      logger.setDebugEnabled(newDebugState);
      setIsDebugEnabled(newDebugState);
      fetchLogs(); // Refresh logs
    }
  };

  // Format timestamp to readable format
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getLevelColorClass = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive';
      case 'WARN':
        return 'bg-caution/10 text-caution dark:bg-caution/10 dark:text-caution';
      case 'INFO':
        return 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary';
      case 'DEBUG':
        return 'bg-muted/40 text-foreground dark:bg-card dark:text-muted-foreground';
      default:
        return 'bg-muted/40 text-foreground dark:bg-card dark:text-muted-foreground';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <AlertCircle className="h-4 w-4" />;
      case 'WARN':
        return <AlertTriangle className="h-4 w-4" />;
      case 'INFO':
        return <Info className="h-4 w-4" />;
      case 'DEBUG':
        return <RotateCcw className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Clear Logs Confirmation - Responsive Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle>Clear Logs</DrawerTitle>
              <DrawerDescription>
                Are you sure you want to clear{' '}
                {selectedLoggerName === 'all'
                  ? 'ALL logs from EVERY logger'
                  : `all logs for the ${selectedLoggerName} logger`}
                ? This action cannot be undone and will remove all historical log data.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="gap-2">
              <Button
                onClick={confirmClearLogs}
                className={
                  selectedLoggerName === 'all' ? 'bg-destructive hover:bg-destructive text-white' : ''
                }
              >
                {selectedLoggerName === 'all' ? 'Clear All Loggers' : 'Clear Logs'}
              </Button>
              <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
                Cancel
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Logs</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to clear{' '}
                {selectedLoggerName === 'all'
                  ? 'ALL logs from EVERY logger'
                  : `all logs for the ${selectedLoggerName} logger`}
                ? This action cannot be undone and will remove all historical log data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmClearLogs}
                className={
                  selectedLoggerName === 'all' ? 'bg-destructive hover:bg-destructive text-white' : ''
                }
              >
                {selectedLoggerName === 'all' ? 'Clear All Loggers' : 'Clear Logs'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-caution bg-caution/10 p-1.5 rounded-md">
                <Bug className="h-5 w-5" />
              </span>
              Log Viewer
            </DialogTitle>
            <DialogDescription>View and manage application logs</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 flex-1 overflow-hidden p-2">
            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="flex gap-2">
                <Select value={selectedLoggerName} onValueChange={setSelectedLoggerName}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select logger">
                      {selectedLoggerName &&
                        (() => {
                          const logger = loggerMap[selectedLoggerName];
                          const hasDebugEnabled =
                            logger &&
                            selectedLoggerName !== 'all' &&
                            selectedLoggerName !== 'error_boundaries' &&
                            selectedLoggerName !== 'security_audit' &&
                            logger.isDebugEnabled();
                          const displayName =
                            selectedLoggerName === 'all'
                              ? 'All Logs'
                              : selectedLoggerName === 'error_boundaries'
                                ? 'Error Boundaries'
                                : selectedLoggerName === 'security_audit'
                                  ? 'Security Audit (Read-Only)'
                                  : selectedLoggerName.charAt(0).toUpperCase() +
                                    selectedLoggerName.slice(1).replace('_', ' ');

                          return (
                            <div className="flex items-center justify-between w-full">
                              <span>{displayName}</span>
                              {hasDebugEnabled && (
                                <span className="ml-2 px-1.5 py-0.5 bg-caution/10 text-caution text-xs rounded font-medium">
                                  DEBUG
                                </span>
                              )}
                            </div>
                          );
                        })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(loggerMap).map((name) => {
                      const logger = loggerMap[name];
                      const hasDebugEnabled =
                        logger &&
                        name !== 'all' &&
                        name !== 'error_boundaries' &&
                        name !== 'security_audit' &&
                        logger.isDebugEnabled();
                      const displayName =
                        name === 'all'
                          ? 'All Logs'
                          : name === 'error_boundaries'
                            ? 'Error Boundaries'
                            : name === 'security_audit'
                              ? 'Security Audit (Read-Only)'
                              : name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' ');

                      return (
                        <SelectItem key={name} value={name}>
                          <div className="flex items-center justify-between w-full">
                            <span>{displayName}</span>
                            {hasDebugEnabled && (
                              <span className="ml-2 px-1.5 py-0.5 bg-caution/10 text-caution text-xs rounded font-medium">
                                DEBUG
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={fetchLogs} title="Refresh logs">
                  <RefreshCw className="h-4 w-4" />
                </Button>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-refresh"
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                  />
                  <Label htmlFor="auto-refresh" className="text-sm">
                    Auto
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex items-center gap-2 px-2 py-1 rounded-md border border-input">
                  <Switch
                    checked={isDebugEnabled}
                    onCheckedChange={handleToggleDebugMode}
                    disabled={
                      selectedLoggerName === 'all' ||
                      selectedLoggerName === 'error_boundaries' ||
                      selectedLoggerName === 'security_audit'
                    }
                    className={isDebugEnabled ? 'data-[state=checked]:bg-caution' : ''}
                  />
                  <Label
                    className={`text-xs whitespace-nowrap ${isDebugEnabled ? 'font-medium text-caution' : 'text-muted-foreground'}`}
                    title={
                      selectedLoggerName === 'all'
                        ? 'Debug mode can only be set per individual logger'
                        : selectedLoggerName === 'error_boundaries'
                          ? "Error boundary reports don't have debug mode"
                          : selectedLoggerName === 'security_audit'
                            ? "Security audit log doesn't have debug mode"
                            : 'Toggle debug mode for this logger'
                    }
                  >
                    Debug Mode
                  </Label>
                </div>

                <Button
                  variant="outline"
                  onClick={handleDownloadLogs}
                  disabled={logs.length === 0}
                  title="Download logs as JSON"
                >
                  <Download className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  onClick={handleClearLogs}
                  disabled={logs.length === 0 || selectedLoggerName === 'security_audit'}
                  title={
                    selectedLoggerName === 'security_audit'
                      ? 'Security audit log can only be cleared from Security Settings'
                      : 'Clear logs'
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {Object.entries(levelFilters).map(([level, isEnabled]) => (
                <Badge
                  key={level}
                  variant="outline"
                  className={`cursor-pointer ${isEnabled ? getLevelColorClass(level) : ''}`}
                  onClick={() =>
                    setLevelFilters({
                      ...levelFilters,
                      [level]: !isEnabled,
                    })
                  }
                >
                  {getLevelIcon(level)}
                  <span className="ml-1">{level}</span>
                </Badge>
              ))}

              <div className="flex-1 min-w-[200px] mt-2 sm:mt-0">
                <div className="relative w-full">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                  <Input
                    placeholder="Search logs..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="pl-8 pr-2 h-9 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden border rounded-md">
              <ScrollArea className="h-[50vh] p-4">
                {filteredLogs.length > 0 ? (
                  <div className="space-y-1">
                    {filteredLogs.map((log, index) => (
                      <div key={index} className="p-2 rounded-md text-sm hover:bg-muted">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={getLevelColorClass(log.level)}>
                            {getLevelIcon(log.level)}
                            <span className="ml-1">{log.level}</span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                        <div className="font-medium">{log.message}</div>
                        {log.args && log.args.length > 0 && (
                          <pre className="mt-1 text-xs bg-muted p-2 rounded-md overflow-x-auto">
                            {log.args.map((arg, argIndex) => (
                              <div key={argIndex}>
                                {typeof arg === 'object'
                                  ? JSON.stringify(arg, null, 2)
                                  : String(arg)}
                              </div>
                            ))}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    {logs.length === 0
                      ? 'No logs available for this module'
                      : 'No logs match the current filters'}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <div className="flex-1 text-sm text-muted-foreground">
              {filteredLogs.length} of {logs.length} log entries
              {selectedLoggerName === 'security_audit' && (
                <div className="text-xs text-caution mt-1">
                  Security audit entries can only be cleared from Security Settings
                </div>
              )}
            </div>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
