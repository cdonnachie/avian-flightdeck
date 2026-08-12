'use client';

import { useState, useEffect, useRef } from 'react';
import { securityService } from '@/services/core/SecurityService';
import { toast } from 'sonner';
import { SecuritySettings, SecurityAuditEntry } from '@/types/security';
import { StorageService } from '@/services/core/StorageService';
import {
  Shield,
  Fingerprint,
  FileText,
  Clock,
  CheckCircle,
  X,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

// Shadcn UI components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SecuritySettingsPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function SecuritySettingsPanel({
  isOpen,
  onClose,
}: SecuritySettingsPanelProps = {}) {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [auditLog, setAuditLog] = useState<SecurityAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'audit'>('settings');
  const [filterType, setFilterType] = useState<'all' | 'success' | 'failure'>('all');
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10); // Show 10 entries per page
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    // Store ref for cleanup
    const timeoutRef = updateTimeoutRef;

    const loadSettings = async () => {
      try {
        const securitySettings = await securityService.getSecuritySettings();
        setSettings(securitySettings);
      } catch (error) {
        toast.error('Error loading settings', {
          description: 'Failed to load security settings',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const checkBiometricSupport = async () => {
      const capabilities = await securityService.getBiometricCapabilities();
      setBiometricSupported(capabilities.isSupported);
    };

    const init = async () => {
      await loadSettings();
      await loadAuditLog();
      await checkBiometricSupport();
    };
    init();

    // Cleanup timeout on unmount
    return () => {
      const currentTimeout = timeoutRef.current;
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      const securitySettings = await securityService.getSecuritySettings();
      setSettings(securitySettings);
    } catch (error) {
      toast.error('Error loading settings', {
        description: 'Failed to load security settings',
      });
    }
  };

  const loadAuditLog = async () => {
    try {
      const log = await securityService.getSecurityAuditLog();
      setAuditLog(log); // Load all entries for pagination
      setCurrentPage(1); // Reset to first page when reloading
    } catch (error) {
      toast.error('Error loading audit log', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleSettingsUpdate = async (newSettings: Partial<SecuritySettings>) => {
    if (!settings) return;

    // Update local state immediately for responsive UI
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    // Check if biometric settings have changed
    const biometricSettingsChanged = newSettings.biometric !== undefined;

    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Set new timeout for actual save
    const timeout = setTimeout(async () => {
      setIsSaving(true);
      try {
        await securityService.updateSecuritySettings(newSettings);

        // If biometric settings changed, dispatch an event to notify other components
        if (biometricSettingsChanged) {
          const event = new CustomEvent('security-settings-changed', {
            detail: { biometric: updatedSettings.biometric },
          });
          window.dispatchEvent(event);
        }

        toast.success('Settings updated', {
          description: 'Security settings have been saved',
        });
      } catch (error) {
        toast.error('Update failed', {
          description: 'Failed to update security settings',
        });
        // Revert local changes on error
        await loadSettings();
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1 second delay

    updateTimeoutRef.current = timeout;
  };

  const formatTimeoutDisplay = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  const formatAuditLogTime = (timestamp: number) => {
    const date = new Date(timestamp);
    // Check if the log is from today
    const isToday = new Date().toDateString() === date.toDateString();

    // For mobile screens or today's entries, show only time
    if (isToday || isMobile) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // For older entries, show date and time in a more compact format
    return (
      date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'wallet_unlock':
      case 'wallet_lock':
        return <Shield className="w-4 h-4" />;
      case 'biometric_auth':
        return <Fingerprint className="w-4 h-4" />;
      case 'transaction_sign':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const toggleEntryExpand = (entryId: string) => {
    setExpandedEntries((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }));
  };

  const filteredAuditLog = auditLog.filter((entry) => {
    if (filterType === 'all') return true;
    if (filterType === 'success') return entry.success;
    if (filterType === 'failure') return !entry.success;
    return true;
  });

  // Pagination calculations
  const totalEntries = filteredAuditLog.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const paginatedEntries = filteredAuditLog.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType]);

  const openClearDialog = () => {
    setIsClearDialogOpen(true);
  };

  const clearAuditLog = async () => {
    try {
      await securityService.clearSecurityAuditLog();
      setAuditLog([]);
      toast.success('Audit log cleared', {
        description: 'Security audit log has been cleared',
      });
    } catch (error) {
      toast.error('Clear failed', {
        description: 'Failed to clear audit log',
      });
    } finally {
      setIsClearDialogOpen(false);
    }
  };

  if (isLoading || !settings) {
    const loadingContent = (
      <div className="flex justify-center items-center p-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

    // If used as modal/drawer, wrap in appropriate container
    if (isOpen !== undefined && onClose) {
      if (isMobile) {
        return (
          <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="h-[90vh] flex flex-col">
              <DrawerHeader className="flex-shrink-0">
                <DrawerTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-primary" />
                  Security Settings
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col flex-1 overflow-hidden">{loadingContent}</div>
            </DrawerContent>
          </Drawer>
        );
      }
      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center">
                <Shield className="w-5 h-5 mr-2 text-primary" />
                Security Settings
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col flex-1 overflow-hidden">{loadingContent}</div>
          </DialogContent>
        </Dialog>
      );
    }

    // Standalone usage
    return loadingContent;
  }

  const renderContent = () => (
    <Card className="w-full border-0 shadow-none">
      <CardHeader className={cn(isMobile ? 'p-4' : '')}>
        <div className="flex justify-between items-center">
          <div className="space-y-0.5">
            <CardTitle>Configure security features to protect your wallet</CardTitle>
          </div>

          {isSaving && (
            <div className="flex items-center text-sm text-muted-foreground">
              <div className="w-3 h-3 mr-2 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Saving...
            </div>
          )}
        </div>
      </CardHeader>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'settings' | 'audit')}
        className="w-full"
      >
        <div className={cn(isMobile ? 'px-4' : 'px-6')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings" className="flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Security Settings
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Audit Log ({auditLog.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <CardContent className={cn('pt-6', isMobile ? 'px-4 pb-4' : '')}>
          <TabsContent value="settings" className="space-y-6 mt-0">
            {/* Auto-lock Settings Section */}
            <div className="space-y-4">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-caution mr-2" />
                <h3 className="text-lg font-medium">Auto-lock Settings</h3>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-lock-enabled" className="flex-1">
                    Enable auto-lock
                  </Label>
                  <Switch
                    id="auto-lock-enabled"
                    checked={settings.autoLock.enabled}
                    onCheckedChange={(checked) =>
                      handleSettingsUpdate({
                        autoLock: { ...settings.autoLock, enabled: checked },
                      })
                    }
                  />
                </div>

                {settings.autoLock.enabled && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="lock-timeout">Lock timeout</Label>
                        <span className="text-sm text-muted-foreground font-medium">
                          {formatTimeoutDisplay(settings.autoLock.timeout)}
                        </span>
                      </div>
                      <Slider
                        id="lock-timeout"
                        min={60000} // 1 minute
                        max={3600000} // 1 hour
                        step={60000} // 1 minute steps
                        value={[settings.autoLock.timeout]}
                        onValueChange={(values) =>
                          handleSettingsUpdate({
                            autoLock: { ...settings.autoLock, timeout: values[0] },
                          })
                        }
                        className="w-full"
                      />
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">1 min</span>
                        <span className="text-xs text-muted-foreground">1 hour</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="require-password-timeout" className="flex-1">
                        Require password after timeout
                      </Label>
                      <Switch
                        id="require-password-timeout"
                        checked={settings.autoLock.requirePasswordAfterTimeout}
                        onCheckedChange={(checked) =>
                          handleSettingsUpdate({
                            autoLock: {
                              ...settings.autoLock,
                              requirePasswordAfterTimeout: checked,
                            },
                          })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Biometric Authentication Section */}
            <div className="space-y-4">
              <div className="flex items-center">
                <Fingerprint className="h-5 w-5 text-primary mr-2" />
                <h3 className="text-lg font-medium">Biometric Authentication</h3>
              </div>

              <Separator />

              {biometricSupported ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="biometric-enabled" className="flex-1">
                      Enable biometric authentication
                    </Label>
                    <Switch
                      id="biometric-enabled"
                      checked={settings.biometric.enabled}
                      onCheckedChange={(checked) =>
                        handleSettingsUpdate({
                          biometric: { ...settings.biometric, enabled: checked },
                        })
                      }
                    />
                  </div>

                  {settings.biometric.enabled && (
                    <>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="require-for-transactions" className="flex-1">
                          Require for transactions
                        </Label>
                        <Switch
                          id="require-for-transactions"
                          checked={settings.biometric.requireForTransactions}
                          onCheckedChange={(checked) =>
                            handleSettingsUpdate({
                              biometric: { ...settings.biometric, requireForTransactions: checked },
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor="require-for-exports" className="flex-1">
                          Require for private key/mnemonic exports
                        </Label>
                        <Switch
                          id="require-for-exports"
                          checked={settings.biometric.requireForExports}
                          onCheckedChange={(checked) =>
                            handleSettingsUpdate({
                              biometric: { ...settings.biometric, requireForExports: checked },
                            })
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Alert className="bg-caution/10 border-caution/30">
                  <Info className="h-4 w-4 text-caution" />
                  <AlertDescription className="text-caution">
                    Biometric authentication is not supported on this device or browser.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Security Audit Log Section */}
            <div className="space-y-4">
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-destructive mr-2" />
                <h3 className="text-lg font-medium">Security Audit Log</h3>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="audit-enabled" className="flex-1">
                    Enable security audit logging
                  </Label>
                  <Switch
                    id="audit-enabled"
                    checked={settings.auditLog.enabled}
                    onCheckedChange={(checked) =>
                      handleSettingsUpdate({
                        auditLog: { ...settings.auditLog, enabled: checked },
                      })
                    }
                  />
                </div>

                {settings.auditLog.enabled && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="retention-period">Retention period</Label>
                      <span className="text-sm text-muted-foreground font-medium">
                        {settings.auditLog.retentionDays} days
                      </span>
                    </div>
                    <Slider
                      id="retention-period"
                      min={7}
                      max={365}
                      step={1}
                      value={[settings.auditLog.retentionDays]}
                      onValueChange={(values) =>
                        handleSettingsUpdate({
                          auditLog: { ...settings.auditLog, retentionDays: values[0] },
                        })
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">7 days</span>
                      <span className="text-xs text-muted-foreground">1 year</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6 mt-0">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium">Security Audit Log</h3>
                <p className="text-sm text-muted-foreground">
                  {totalEntries} total entries
                  {totalEntries !== filteredAuditLog.length &&
                    ` (${filteredAuditLog.length} filtered)`}
                </p>
              </div>
              <Button
                onClick={openClearDialog}
                variant="destructive"
                size="sm"
                className="flex items-center"
                disabled={auditLog.length === 0}
              >
                <X className="mr-1 h-4 w-4" />
                Clear Log
              </Button>
            </div>

            <div className="flex space-x-2 overflow-x-auto pb-2">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
                className="rounded-full"
              >
                All Entries
              </Button>
              <Button
                variant={filterType === 'success' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('success')}
                className="rounded-full"
              >
                Success Only
              </Button>
              <Button
                variant={filterType === 'failure' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('failure')}
                className="rounded-full"
              >
                Failures Only
              </Button>
            </div>

            {filteredAuditLog.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No audit log entries"
                description="Security events like unlocks and setting changes will appear here as they happen."
              />
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedEntries.map((entry) => (
                    <Card
                      key={entry.id}
                      className={`overflow-hidden ${!entry.success ? 'border-destructive/30' : ''}`}
                    >
                      <div
                        className="p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleEntryExpand(entry.id)}
                      >
                        {/* Mobile-first responsive layout */}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            {getActionIcon(entry.action)}
                            <span className="font-medium truncate">
                              {entry.action.replace('_', ' ')}
                            </span>
                            <Badge
                              variant={entry.success ? 'default' : 'destructive'}
                              className="ml-2 flex-shrink-0"
                            >
                              {entry.success ? 'Success' : 'Failed'}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {formatAuditLogTime(entry.timestamp)}
                          </span>
                        </div>

                        {expandedEntries[entry.id] && (
                          <div className="mt-3 text-sm">
                            <div className="bg-muted/50 p-2 rounded text-xs font-mono break-words">
                              {entry.details}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pt-4">
                    <div className="text-sm text-muted-foreground text-center sm:text-left order-2 sm:order-1">
                      Showing {startIndex + 1}-{Math.min(endIndex, totalEntries)} of {totalEntries}{' '}
                      entries
                    </div>

                    <div className="order-1 sm:order-2 flex justify-center">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(e: React.MouseEvent) => {
                                e.preventDefault();
                                if (currentPage > 1) {
                                  setCurrentPage(currentPage - 1);
                                }
                              }}
                              className={
                                currentPage === 1
                                  ? 'pointer-events-none opacity-50'
                                  : 'cursor-pointer'
                              }
                            />
                          </PaginationItem>

                          {/* Show first page */}
                          {currentPage > 2 && (
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  setCurrentPage(1);
                                }}
                                className="cursor-pointer"
                              >
                                1
                              </PaginationLink>
                            </PaginationItem>
                          )}

                          {/* Show ellipsis if needed */}
                          {currentPage > 3 && (
                            <PaginationItem className="hidden sm:block">
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}

                          {/* Show previous page */}
                          {currentPage > 1 && (
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  setCurrentPage(currentPage - 1);
                                }}
                                className="cursor-pointer"
                              >
                                {currentPage - 1}
                              </PaginationLink>
                            </PaginationItem>
                          )}

                          {/* Show current page */}
                          <PaginationItem>
                            <PaginationLink href="#" isActive={true} className="cursor-pointer">
                              {currentPage}
                            </PaginationLink>
                          </PaginationItem>

                          {/* Show next page */}
                          {currentPage < totalPages && (
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  setCurrentPage(currentPage + 1);
                                }}
                                className="cursor-pointer"
                              >
                                {currentPage + 1}
                              </PaginationLink>
                            </PaginationItem>
                          )}

                          {/* Show ellipsis if needed */}
                          {currentPage < totalPages - 2 && (
                            <PaginationItem className="hidden sm:block">
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}

                          {/* Show last page */}
                          {currentPage < totalPages - 1 && (
                            <PaginationItem>
                              <PaginationLink
                                href="#"
                                onClick={(e: React.MouseEvent) => {
                                  e.preventDefault();
                                  setCurrentPage(totalPages);
                                }}
                                className="cursor-pointer"
                              >
                                {totalPages}
                              </PaginationLink>
                            </PaginationItem>
                          )}

                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e: React.MouseEvent) => {
                                e.preventDefault();
                                if (currentPage < totalPages) {
                                  setCurrentPage(currentPage + 1);
                                }
                              }}
                              className={
                                currentPage === totalPages
                                  ? 'pointer-events-none opacity-50'
                                  : 'cursor-pointer'
                              }
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </CardContent>
      </Tabs>

      {/* Clear Audit Log Confirmation - Responsive Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle className="flex items-center justify-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Clear Security Audit Log
              </DrawerTitle>
              <DrawerDescription>
                Are you sure you want to clear the security audit log? This action cannot be undone
                and all security event history will be permanently deleted.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="gap-2">
              <Button className="bg-destructive hover:bg-destructive text-white" onClick={clearAuditLog}>
                Clear Log
              </Button>
              <Button variant="outline" onClick={() => setIsClearDialogOpen(false)}>
                Cancel
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
          <AlertDialogContent className="dark:bg-card border dark:border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Clear Security Audit Log
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to clear the security audit log? This action cannot be undone
                and all security event history will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive text-white"
                onClick={clearAuditLog}
              >
                Clear Log
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );

  // If used as modal/drawer, wrap in appropriate container
  if (isOpen !== undefined && onClose) {
    if (isMobile) {
      return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DrawerContent className="h-[90vh] flex flex-col">
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle className="flex items-center">
                <Shield className="w-5 h-5 mr-2 text-primary" />
                Security Settings
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col flex-1 overflow-y-auto">{renderContent()}</div>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center">
              <Shield className="w-5 h-5 mr-2 text-primary" />
              Security Settings
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 overflow-y-auto">{renderContent()}</div>
        </DialogContent>
      </Dialog>
    );
  }

  // Standalone usage
  return renderContent();
}
