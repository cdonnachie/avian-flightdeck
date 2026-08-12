'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search,
    Trash2,
    Download,
    RefreshCw,
    AlertCircle,
    Info,
    AlertTriangle,
    RotateCcw,
    Bug,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
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
    termsLogger,
    walletContextLogger,
    routeGuardLogger,
    dataWipeLogger,
} from '@/lib/Logger';
import { errorReporting, ErrorReport } from '@/services/ErrorReportingService';
import { securityService } from '@/services/core/SecurityService';
import { useMediaQuery } from '@/hooks/use-media-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface InlineLogViewerProps {
    className?: string;
}

// Extended log entry type to include logger name for table display
interface ExtendedLogEntry extends LogEntry {
    loggerName?: string;
}

// Define logger types
type LoggerType = 'wallet' | 'notification' | 'security' | 'storage' | 'electrum' | 'price' | 'watch_address' | 'terms' | 'wallet_context' | 'route_guard' | 'data_wipe';
type AllLoggerType = LoggerType | 'all' | 'error_boundaries' | 'security_audit';

// Map of logger names to their instances
const loggerMap: Record<LoggerType, ReturnType<typeof Logger.getLogger>> = {
    wallet: walletLogger,
    notification: notificationLogger,
    security: securityLogger,
    storage: storageLogger,
    electrum: electrumLogger,
    price: priceLogger,
    watch_address: watchAddressLogger,
    terms: termsLogger,
    wallet_context: walletContextLogger,
    route_guard: routeGuardLogger,
    data_wipe: dataWipeLogger
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


export function InlineLogViewer({ className = "" }: InlineLogViewerProps = {}) {
    const [selectedLoggerName, setSelectedLoggerName] = useState<AllLoggerType>('all');
    const [logs, setLogs] = useState<ExtendedLogEntry[]>([]);
    const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(
        selectedLoggerName in loggerMap ? (loggerMap[selectedLoggerName as LoggerType]?.isDebugEnabled() || false) : false,
    );
    const [clearDialogOpen, setClearDialogOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<ExtendedLogEntry | null>(null);
    const [logDetailOpen, setLogDetailOpen] = useState(false);
    const isMobile = useMediaQuery('(max-width: 640px)');

    // Update column visibility based on mobile state
    useEffect(() => {
        setColumnVisibility({
            message: !isMobile, // Hide message column on mobile
        });
    }, [isMobile]);

    // Define table columns
    const columns = useMemo<ColumnDef<ExtendedLogEntry>[]>(
        () => [
            {
                accessorKey: 'level',
                header: 'Level',
                cell: ({ row }) => {
                    const level = row.getValue('level') as string;
                    return (
                        <Badge variant="outline" className={`${getLevelColorClass(level)} shrink-0 w-fit`}>
                            {getLevelIcon(level)}
                            <span className="ml-1">{level}</span>
                        </Badge>
                    );
                },
                filterFn: (row, id, value) => {
                    return value.includes(row.getValue(id));
                },
            },
            {
                accessorKey: 'timestamp',
                header: 'Time',
                cell: ({ row }) => {
                    const timestamp = row.getValue('timestamp') as number;
                    return (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(timestamp)}
                        </span>
                    );
                },
                sortingFn: 'basic',
            },
            {
                accessorKey: 'loggerName',
                header: 'Logger',
                cell: ({ row }) => {
                    const loggerName = row.getValue('loggerName') as string;
                    if (!loggerName) return null;
                    return (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                            {loggerName}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'message',
                header: 'Message',
                cell: ({ row }) => {
                    const message = row.getValue('message') as string;
                    return (
                        <div className="min-w-0 flex-1">
                            <div className="font-medium break-words overflow-wrap-anywhere truncate">
                                {message}
                            </div>
                        </div>
                    );
                },
            },
        ],
        [],
    );

    // Initialize the table
    const table = useReactTable({
        data: logs,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
        },
        initialState: {
            pagination: {
                pageSize: 25,
            },
        },
    });

    const fetchLogs = useCallback(async () => {
        if (selectedLoggerName === 'all') {
            let allLogs: ExtendedLogEntry[] = [];

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
            const logger = selectedLoggerName in loggerMap ? loggerMap[selectedLoggerName as LoggerType] : null;
            if (logger) {
                const logEntries = logger.getLogs().sort((a: LogEntry, b: LogEntry) => b.timestamp - a.timestamp);
                setLogs(logEntries);
            }
        }
    }, [selectedLoggerName]);

    useEffect(() => {
        // Reset pagination and filters when changing loggers
        table.resetColumnFilters();
        table.setPageIndex(0);

        if (
            selectedLoggerName !== 'all' &&
            selectedLoggerName !== 'error_boundaries' &&
            selectedLoggerName !== 'security_audit' &&
            selectedLoggerName in loggerMap
        ) {
            setIsDebugEnabled(loggerMap[selectedLoggerName as LoggerType]?.isDebugEnabled() || false);
        } else {
            setIsDebugEnabled(false);
        }

        fetchLogs();
    }, [selectedLoggerName, fetchLogs, table]);

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (autoRefresh) {
            intervalId = setInterval(fetchLogs, 2000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [autoRefresh, selectedLoggerName, fetchLogs]);

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
            const logger = selectedLoggerName in loggerMap ? loggerMap[selectedLoggerName as LoggerType] : null;
            if (logger) {
                logger.clearLogs();
            }
        }

        // Reset the displayed logs
        setLogs([]);

        // Close the dialog
        setClearDialogOpen(false);
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
        if (selectedLoggerName in loggerMap) {
            const logger = loggerMap[selectedLoggerName as LoggerType];
            if (logger && selectedLoggerName !== 'all' && selectedLoggerName !== 'error_boundaries') {
                const newDebugState = !isDebugEnabled;
                logger.setDebugEnabled(newDebugState);
                setIsDebugEnabled(newDebugState);
                fetchLogs(); // Refresh logs
            }
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

    // Get available level options for filtering
    const levelOptions = ['INFO', 'DEBUG', 'WARN', 'ERROR'];

    // Get the current level filter values
    const currentLevelFilter = (table.getColumn('level')?.getFilterValue() as string[]) || levelOptions;

    return (
        <div className={`w-full max-w-full flex flex-col border rounded-lg shadow bg-background overflow-hidden ${className}`}>
            {/* Clear Logs Confirmation Dialog/Drawer */}
            {isMobile ? (
                <Drawer open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle>Clear Logs</DrawerTitle>
                            <DrawerDescription>
                                Are you sure you want to clear{' '}
                                {selectedLoggerName === 'all'
                                    ? 'ALL logs from EVERY logger'
                                    : `all logs for the ${selectedLoggerName === 'error_boundaries'
                                        ? 'Error Boundaries'
                                        : selectedLoggerName === 'security_audit'
                                            ? 'Security Audit'
                                            : selectedLoggerName.charAt(0).toUpperCase() + selectedLoggerName.slice(1).replace('_', ' ')} logger`}
                                ? This action cannot be undone.
                            </DrawerDescription>
                        </DrawerHeader>
                        <DrawerFooter>
                            <Button
                                onClick={confirmClearLogs}
                                className={
                                    selectedLoggerName === 'all'
                                        ? 'bg-destructive hover:bg-destructive text-white'
                                        : ''
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
                <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Clear Logs</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to clear{' '}
                                {selectedLoggerName === 'all'
                                    ? 'ALL logs from EVERY logger'
                                    : `all logs for the ${selectedLoggerName === 'error_boundaries'
                                        ? 'Error Boundaries'
                                        : selectedLoggerName === 'security_audit'
                                            ? 'Security Audit'
                                            : selectedLoggerName.charAt(0).toUpperCase() + selectedLoggerName.slice(1).replace('_', ' ')} logger`}
                                ? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmClearLogs}
                                className={
                                    selectedLoggerName === 'all'
                                        ? 'bg-destructive hover:bg-destructive text-white'
                                        : ''
                                }
                            >
                                {selectedLoggerName === 'all' ? 'Clear All Loggers' : 'Clear Logs'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Log Detail Dialog/Drawer */}
            {isMobile ? (
                <Drawer open={logDetailOpen} onOpenChange={setLogDetailOpen}>
                    <DrawerContent className="max-h-[80vh]">
                        <DrawerHeader>
                            <DrawerTitle className="flex items-center gap-2">
                                {selectedLog ? (
                                    <>
                                        <Badge variant="outline" className={`${getLevelColorClass(selectedLog.level)} shrink-0`}>
                                            {getLevelIcon(selectedLog.level)}
                                            <span className="ml-1">{selectedLog.level}</span>
                                        </Badge>
                                        Log Details
                                    </>
                                ) : (
                                    'Log Details'
                                )}
                            </DrawerTitle>
                            <DrawerDescription>
                                {selectedLog && (
                                    <div className="flex flex-col gap-2 text-left">
                                        <div className="text-xs text-muted-foreground">
                                            {formatTimestamp(selectedLog.timestamp)}
                                        </div>
                                        {selectedLog.loggerName && (
                                            <Badge variant="outline" className="w-fit">
                                                {selectedLog.loggerName}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </DrawerDescription>
                        </DrawerHeader>
                        <div className="px-4 pb-4 overflow-y-auto">
                            {selectedLog && (
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-medium mb-2">Message</h4>
                                        <p className="text-sm break-words">{selectedLog.message}</p>
                                    </div>
                                    {selectedLog.args && selectedLog.args.length > 0 && (
                                        <div>
                                            <h4 className="font-medium mb-2">Details</h4>
                                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words word-break-all">
                                                {selectedLog.args.map((arg, i) =>
                                                    typeof arg === 'object'
                                                        ? JSON.stringify(arg, null, 2)
                                                        : String(arg)
                                                ).join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <DrawerFooter>
                            <Button variant="outline" onClick={() => setLogDetailOpen(false)}>
                                Close
                            </Button>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            ) : (
                <Dialog open={logDetailOpen} onOpenChange={setLogDetailOpen}>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {selectedLog ? (
                                    <>
                                        <Badge variant="outline" className={`${getLevelColorClass(selectedLog.level)} shrink-0`}>
                                            {getLevelIcon(selectedLog.level)}
                                            <span className="ml-1">{selectedLog.level}</span>
                                        </Badge>
                                        Log Details
                                    </>
                                ) : (
                                    'Log Details'
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {selectedLog && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {formatTimestamp(selectedLog.timestamp)}
                                        </span>
                                        {selectedLog.loggerName && (
                                            <Badge variant="outline" className="text-xs">
                                                {selectedLog.loggerName}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto">
                            {selectedLog && (
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-medium mb-2">Message</h4>
                                        <p className="text-sm break-words">{selectedLog.message}</p>
                                    </div>
                                    {selectedLog.args && selectedLog.args.length > 0 && (
                                        <div>
                                            <h4 className="font-medium mb-2">Details</h4>
                                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words word-break-all">
                                                {selectedLog.args.map((arg, i) =>
                                                    typeof arg === 'object'
                                                        ? JSON.stringify(arg, null, 2)
                                                        : String(arg)
                                                ).join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setLogDetailOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            {/* Clear Logs Confirmation Dialog/Drawer */}
            {isMobile ? (
                <Drawer open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle>Clear Logs</DrawerTitle>
                            <DrawerDescription>
                                Are you sure you want to clear{' '}
                                {selectedLoggerName === 'all'
                                    ? 'ALL logs from EVERY logger'
                                    : `all logs for the ${selectedLoggerName === 'error_boundaries'
                                        ? 'Error Boundaries'
                                        : selectedLoggerName === 'security_audit'
                                            ? 'Security Audit'
                                            : selectedLoggerName.charAt(0).toUpperCase() + selectedLoggerName.slice(1).replace('_', ' ')} logger`}
                                ? This action cannot be undone.
                            </DrawerDescription>
                        </DrawerHeader>
                        <DrawerFooter>
                            <Button
                                onClick={confirmClearLogs}
                                className={
                                    selectedLoggerName === 'all'
                                        ? 'bg-destructive hover:bg-destructive text-white'
                                        : ''
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
                <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Clear Logs</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to clear{' '}
                                {selectedLoggerName === 'all'
                                    ? 'ALL logs from EVERY logger'
                                    : `all logs for the ${selectedLoggerName === 'error_boundaries'
                                        ? 'Error Boundaries'
                                        : selectedLoggerName === 'security_audit'
                                            ? 'Security Audit'
                                            : selectedLoggerName.charAt(0).toUpperCase() + selectedLoggerName.slice(1).replace('_', ' ')} logger`}
                                ? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmClearLogs}
                                className={
                                    selectedLoggerName === 'all'
                                        ? 'bg-destructive hover:bg-destructive text-white'
                                        : ''
                                }
                            >
                                {selectedLoggerName === 'all' ? 'Clear All Loggers' : 'Clear Logs'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Header */}
            <div className="p-4 border-b flex items-center gap-2">
                <Bug className="h-5 w-5 text-caution" />
                <h2 className="text-lg font-semibold">Log Viewer</h2>
                <span className="ml-auto text-sm text-muted-foreground">
                    View and manage application logs
                </span>
            </div>

            {/* Controls */}
            <div className="p-3 sm:p-4 flex flex-col gap-3">
                {/* Logger Selection and Refresh Controls */}
                <div className="flex flex-col gap-3">
                    {/* Logger Selection */}
                    <Select value={selectedLoggerName} onValueChange={(value) => setSelectedLoggerName(value as AllLoggerType)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select logger">
                                {selectedLoggerName &&
                                    (() => {
                                        const logger = selectedLoggerName in loggerMap ? loggerMap[selectedLoggerName as LoggerType] : null;
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
                                                <span className="truncate">{displayName}</span>
                                                {hasDebugEnabled && (
                                                    <span className="ml-2 px-1.5 py-0.5 bg-caution/10 text-caution text-xs rounded font-medium shrink-0">
                                                        DEBUG
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {/* Special logger options */}
                            <SelectItem value="all">
                                <div className="flex items-center justify-between w-full">
                                    <span className="truncate">All Logs</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="error_boundaries">
                                <div className="flex items-center justify-between w-full">
                                    <span className="truncate">Error Boundaries</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="security_audit">
                                <div className="flex items-center justify-between w-full">
                                    <span className="truncate">Security Audit (Read-Only)</span>
                                </div>
                            </SelectItem>

                            {/* Logger map options */}
                            {Object.keys(loggerMap).map((name) => {
                                const logger = name in loggerMap ? loggerMap[name as LoggerType] : null;
                                const hasDebugEnabled =
                                    logger &&
                                    name !== 'all' &&
                                    name !== 'error_boundaries' &&
                                    name !== 'security_audit' &&
                                    logger.isDebugEnabled();
                                const displayName = name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' ');

                                return (
                                    <SelectItem key={name} value={name}>
                                        <div className="flex items-center justify-between w-full">
                                            <span className="truncate">{displayName}</span>
                                            {hasDebugEnabled && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-caution/10 text-caution text-xs rounded font-medium shrink-0">
                                                    DEBUG
                                                </span>
                                            )}
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchLogs} className="flex-1">
                            <RefreshCw className="h-4 w-4" />
                            <span className="ml-2 sm:hidden">Refresh</span>
                            <span className="ml-2 hidden sm:inline">Refresh</span>
                        </Button>

                        <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
                            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                            <Label htmlFor="auto-refresh" className="text-sm">Auto</Label>
                        </div>
                    </div>

                    {/* Export and Clear Buttons */}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleDownloadLogs} disabled={!logs.length} className="flex-1">
                            <Download className="h-4 w-4" />
                            <span className="ml-2">Export</span>
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setClearDialogOpen(true)}
                            disabled={!logs.length || selectedLoggerName === 'security_audit'}
                            className="flex-1"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-2">Clear</span>
                        </Button>
                    </div>
                </div>

                {/* Filters and Search */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                        {levelOptions.map((level) => {
                            const isEnabled = currentLevelFilter.includes(level);
                            return (
                                <Badge
                                    key={level}
                                    variant="outline"
                                    className={`cursor-pointer transition-colors ${isEnabled ? getLevelColorClass(level) : ''}`}
                                    onClick={() => {
                                        const newFilter = isEnabled
                                            ? currentLevelFilter.filter(l => l !== level)
                                            : [...currentLevelFilter, level];
                                        table.getColumn('level')?.setFilterValue(newFilter.length === levelOptions.length ? undefined : newFilter);
                                    }}
                                >
                                    {getLevelIcon(level)}
                                    <span className="ml-1">{level}</span>
                                </Badge>
                            );
                        })}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search messages..."
                            value={(table.getColumn('message')?.getFilterValue() as string) ?? ''}
                            onChange={(event) =>
                                table.getColumn('message')?.setFilterValue(event.target.value)
                            }
                            className="pl-10 pr-4 h-10"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-hidden border-t">
                <div className="h-[50vh] sm:h-[60vh] lg:h-[70vh] overflow-auto">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead key={header.id} className={header.id === 'message' ? 'w-full' : ''}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && 'selected'}
                                        className="hover:bg-muted/50 cursor-pointer"
                                        onClick={() => {
                                            setSelectedLog(row.original);
                                            setLogDetailOpen(true);
                                        }}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} className="align-top">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                        {logs.length === 0 ? 'No logs available' : 'No logs match the current filters'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 sm:p-4 border-t">
                <div className="text-sm text-muted-foreground order-2 sm:order-1">
                    Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
                    {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of{' '}
                    {table.getFilteredRowModel().rows.length} entries
                </div>
                <div className="flex items-center gap-2 order-1 sm:order-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1">
                        <Input
                            className="w-16 h-8 text-center"
                            value={table.getState().pagination.pageIndex + 1}
                            onChange={(e) => {
                                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                                table.setPageIndex(page);
                            }}
                        />
                        <span className="text-sm text-muted-foreground">
                            of {table.getPageCount()}
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between text-sm text-muted-foreground">
                <span>
                    {table.getFilteredRowModel().rows.length} of {logs.length} log entries
                </span>
                {selectedLoggerName !== 'all' && selectedLoggerName !== 'error_boundaries' && selectedLoggerName !== 'security_audit' && (
                    <div className="flex items-center gap-2">
                        <span className="hidden sm:inline">Debug Mode:</span>
                        <Switch
                            id="debug-mode"
                            checked={isDebugEnabled}
                            onCheckedChange={handleToggleDebugMode}
                        />
                        <Label htmlFor="debug-mode" className="text-xs sm:hidden">Debug</Label>
                    </div>
                )}
            </div>
        </div>
    );
}
