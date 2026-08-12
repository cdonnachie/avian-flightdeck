'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellOff,
  RefreshCw,
  AlertCircle,
  Info,
  Save,
  Settings,
  ChevronRight,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { useWallet } from '@/contexts/WalletContext';
import { StorageService } from '@/services/core/StorageService';
import { NotificationClientService } from '@/services/notifications/client/NotificationClientService';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BrowserNotificationHelp } from './BrowserNotificationHelp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

interface NotificationSettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function NotificationSettings({ isOpen, onClose }: NotificationSettingsProps = {}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    isSupported,
    isEnabled,
    permissionState,
    preferences,
    currentAvnPrice,
    priceLastUpdated,
    enableNotifications,
    disableNotifications,
    updatePreferences,
    refreshPrice,
    testNotification,
  } = useNotifications();

  const { address: activeWalletAddress, wallet: activeWallet } = useWallet();

  const [isRefreshingPrice, setIsRefreshingPrice] = useState(false);
  // Initialize with empty object, all wallets default to disabled
  const [walletNotifications, setWalletNotifications] = useState<{ [address: string]: boolean }>(
    {},
  );
  // Default to false until explicitly set to true from database
  const [activeWalletEnabled, setActiveWalletEnabled] = useState<boolean>(false);
  // Add state for watch address notification threshold
  const [watchThreshold, setWatchThreshold] = useState<number>(0.01);
  const [isThresholdLoading, setIsThresholdLoading] = useState<boolean>(true);

  // Load wallet-specific notification settings from local storage
  const loadWalletNotifications = useCallback(async () => {
    try {
      const wallets = await StorageService.getAllWallets();

      if (wallets && wallets.length > 0) {
        const walletAddresses = wallets.map((wallet) => wallet.address);

        const settings =
          await NotificationClientService.getMultipleWalletNotificationSettings(walletAddresses);

        // Make a defensive copy of the settings to ensure we're displaying the correct boolean values
        const cleanedSettings: { [address: string]: boolean } = {};

        // Explicitly convert all values to true/false, no undefined or truthy/falsy values
        Object.keys(settings).forEach((addr) => {
          cleanedSettings[addr] = settings[addr] === true;
        });

        setWalletNotifications(cleanedSettings);

        // Set current wallet's status
        if (activeWalletAddress) {
          // Use the exact boolean value from settings, defaulting to false if not found
          setActiveWalletEnabled(settings[activeWalletAddress] === true);
        }
      }
    } catch (error) {
      toast.error('Failed to load wallet notifications', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [activeWalletAddress]);

  // Effect to load wallet notifications when the component mounts or active wallet changes
  useEffect(() => {
    loadWalletNotifications();
  }, [activeWalletAddress, loadWalletNotifications]);

  // Load the threshold from settings
  useEffect(() => {
    const loadThreshold = async () => {
      try {
        setIsThresholdLoading(true);
        const settings = await StorageService.getSettings();
        if (settings.watchedAddressThreshold !== undefined) {
          // Convert to number and ensure it's valid
          const threshold = parseFloat(settings.watchedAddressThreshold);
          if (!isNaN(threshold)) {
            setWatchThreshold(threshold);
          }
        }
      } catch (error) {
        toast.error('Failed to load notification threshold', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsThresholdLoading(false);
      }
    };

    loadThreshold();
  }, []);

  // Save wallet-specific notification setting
  const toggleWalletNotifications = async (address: string, enabled: boolean) => {
    // Optimistically update UI
    const updatedSettings = {
      ...walletNotifications,
      [address]: enabled,
    };

    // Update state
    setWalletNotifications(updatedSettings);

    if (address === activeWalletAddress) {
      setActiveWalletEnabled(enabled);
    }

    // If enabling for the first time, also enable global notifications
    if (enabled && !isEnabled) {
      await enableNotifications();
    }

    // Update the local storage using our client service
    try {
      const success = await NotificationClientService.saveWalletNotificationPreferences(address, {
        enabled,
        receiveTransactions: preferences.transactions,
        sendTransactions: preferences.transactions,
        balanceUpdates: preferences.balance,
        securityAlerts: preferences.security,
        minValue: 0, // Default minimum value for notifications
        lastUpdated: Date.now(),
      });

      if (success) {
        toast.success(`Notifications ${enabled ? 'enabled' : 'disabled'} for wallet`, {
          description: `${address.substring(0, 10)}...${address.substring(address.length - 5)}`,
        });
      } else {
        // Revert the UI change on error
        setWalletNotifications({
          ...walletNotifications,
        });
        if (address === activeWalletAddress) {
          setActiveWalletEnabled(!enabled);
        }
        toast.error('Failed to update notification settings');
      }
    } catch (error) {
      // Revert the UI change on error
      setWalletNotifications({
        ...walletNotifications,
      });
      if (address === activeWalletAddress) {
        setActiveWalletEnabled(!enabled);
      }
      toast.error('Error updating notification settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Handle toggling notifications
  const handleToggleNotifications = async () => {
    if (isEnabled) {
      disableNotifications();
    } else {
      await enableNotifications();
    }
  };

  // Handle preference changes
  const handlePreferenceChange = (key: string, value: any) => {
    updatePreferences({ [key]: value });
  };

  // Handle price refresh
  const handleRefreshPrice = async () => {
    setIsRefreshingPrice(true);
    await refreshPrice();
    setIsRefreshingPrice(false);
  };

  // Save the watched address notification threshold
  const saveWatchThreshold = async (value: number) => {
    try {
      // Update the settings in storage
      const settings = await StorageService.getSettings();
      settings.watchedAddressThreshold = value;
      await StorageService.setSettings(settings);

      toast.success('Notification threshold updated', {
        description: `You'll be notified of balance changes greater than ${value} AVN`,
      });
    } catch (error) {
      toast.error('Failed to save notification threshold', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  if (!isSupported) {
    const notSupportedContent = (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-destructive mb-1">
                Notifications Not Supported
              </h3>
              <p className="text-sm text-muted-foreground">
                Your browser does not support push notifications or they are disabled in your
                settings.
              </p>
            </div>
          </div>
        </CardContent>
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
                  <Bell className="w-5 h-5 mr-2 text-primary" />
                  Notification Settings
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col flex-1 overflow-y-auto p-4">{notSupportedContent}</div>
            </DrawerContent>
          </Drawer>
        );
      }
      return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2 text-primary" />
                Notification Settings
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col flex-1 overflow-y-auto p-4">{notSupportedContent}</div>
          </DialogContent>
        </Dialog>
      );
    }

    // Standalone usage
    return notSupportedContent;
  }

  const renderContent = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage wallet notifications and alerts
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={isEnabled ? "default" : "outline"}
            size="sm"
            onClick={async () => {
              if (permissionState === 'denied') {
                // Show browser settings instructions for denied permissions
                toast.info('Notifications are blocked', {
                  description:
                    'Please check your browser settings to allow notifications from this website. In most browsers, you can click the lock or info icon in the address bar to manage site permissions.',
                  duration: 8000,
                });

                // Log the action
                const { notificationLogger } = await import('@/lib/Logger');
                notificationLogger.info('Showed notification permission instructions to user');
              } else {
                // Normal toggle behavior
                handleToggleNotifications();
              }
            }}
            className={permissionState === 'denied' ? 'opacity-50 hover:opacity-100 cursor-help' : ''}
            aria-label={isEnabled ? 'Disable notifications' : 'Enable notifications'}
            title={
              permissionState === 'denied'
                ? 'Show instructions for enabling notifications'
                : 'Global notification toggle'
            }
          >
            {isEnabled ? <Bell className="w-4 h-4 mr-2" /> : <BellOff className="w-4 h-4 mr-2" />}
            {isEnabled ? 'Enabled' : 'Enable'}
          </Button>
        </div>
      </div>

      {/* Current wallet notification toggle */}
      {activeWalletAddress && isEnabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <CardTitle className="text-sm">Current Wallet Notifications</CardTitle>
                <p className="text-xs text-muted-foreground truncate max-w-xs">
                  {activeWalletAddress}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Enable notifications for this wallet</span>
              <label
                className={`relative inline-flex items-center ${permissionState === 'denied'
                    ? 'cursor-help'
                    : !isEnabled
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                onClick={async (e) => {
                  // If permissions are denied, show the help dialog instead of toggling
                  if (permissionState === 'denied') {
                    e.preventDefault();

                    // Show browser settings instructions for denied permissions
                    toast.info('Notifications are blocked', {
                      description:
                        'Please check your browser settings to allow notifications from this website. In most browsers, you can click the lock or info icon in the address bar to manage site permissions.',
                      duration: 8000,
                    });

                    // Log the action
                    const { notificationLogger } = await import('@/lib/Logger');
                    notificationLogger.info(
                      'Showed notification permission instructions to user via wallet toggle',
                    );
                  }
                }}
              >
                <input
                  type="checkbox"
                  value=""
                  className="sr-only peer"
                  checked={walletNotifications[activeWalletAddress] === true}
                  onChange={(e) => {
                    // Only allow toggles if permission is granted and notifications are enabled
                    if (permissionState !== 'denied' && isEnabled) {
                      toggleWalletNotifications(activeWalletAddress, e.target.checked);
                    }
                  }}
                  disabled={permissionState === 'denied' || !isEnabled}
                />
                <div className="w-11 h-6 bg-muted/40 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer dark:bg-card peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-border peer-checked:bg-primary"></div>
              </label>
            </div>
            {walletNotifications[activeWalletAddress] === true && (
              <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                <AlertCircle className="w-3 h-3" />
                <span>Notifications are enabled for this wallet</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {permissionState === 'denied' && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-destructive mb-1">
                  Notifications Blocked
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Notifications are blocked by your browser. Please update your browser settings to enable notifications.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      // Log the action
                      const { notificationLogger } = await import('@/lib/Logger');
                      notificationLogger.info('User clicked How to enable button');

                      // Show browser-specific instructions
                      toast.info('How to enable notifications', {
                        description:
                          'To enable notifications, check your browser settings. In Chrome, click the lock icon in the address bar, select "Site settings" and change Notifications to "Allow". In Firefox, click the lock icon and set Notifications to "Allow". In Safari, go to Preferences > Websites > Notifications.',
                        duration: 10000,
                      });

                      // Attempt to request permission directly - this might work in some browsers
                      // even if previously denied (depends on browser)
                      if ('Notification' in window) {
                        try {
                          const permission = await Notification.requestPermission();

                          // If permission was just granted, update the context
                          if (permission === 'granted') {
                            notificationLogger.info('Permission granted via direct request');

                            // Enable notifications which will trigger the context to re-check permission
                            await enableNotifications();

                            // Show success message
                            toast.success('Notification permission granted!', {
                              description: 'You can now enable notifications for your wallets',
                            });
                          } else {
                            notificationLogger.info(`Permission request resulted in: ${permission}`);
                          }
                        } catch (permissionError) {
                          notificationLogger.error(
                            'Error requesting notification permission:',
                            permissionError,
                          );
                        }
                      }
                    } catch (error) {
                      const { notificationLogger } = await import('@/lib/Logger');
                      notificationLogger.error('Error in how to enable handler:', error);
                    }
                  }}
                >
                  How to enable
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {/* General notification settings */}
        <Card className={`${!isEnabled ? 'opacity-50' : ''}`}>
          <CardHeader>
            <CardTitle className="text-base">Notification Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="balance" className="text-sm font-medium">
                  Balance updates
                </label>
                <input
                  type="checkbox"
                  id="balance"
                  checked={preferences.balance}
                  onChange={(e) => handlePreferenceChange('balance', e.target.checked)}
                  disabled={!isEnabled}
                  className="h-4 w-4 text-primary focus:ring-primary/20 border-input rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="transactions" className="text-sm font-medium">
                  New transactions
                </label>
                <input
                  type="checkbox"
                  id="transactions"
                  checked={preferences.transactions}
                  onChange={(e) => handlePreferenceChange('transactions', e.target.checked)}
                  disabled={!isEnabled}
                  className="h-4 w-4 text-primary focus:ring-primary/20 border-input rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="security" className="text-sm font-medium">
                  Security alerts
                </label>
                <input
                  type="checkbox"
                  id="security"
                  checked={preferences.security}
                  onChange={(e) => handlePreferenceChange('security', e.target.checked)}
                  disabled={!isEnabled}
                  className="h-4 w-4 text-primary focus:ring-primary/20 border-input rounded"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price alert settings */}
        <Card className={`${!isEnabled ? 'opacity-50' : ''}`}>
          <CardHeader>
            <CardTitle className="text-base">Price Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Enable price alerts</span>
              <input
                type="checkbox"
                id="priceAlerts"
                checked={preferences.priceAlerts !== false}
                onChange={(e) => handlePreferenceChange('priceAlerts', e.target.checked)}
                disabled={!isEnabled}
                className="h-4 w-4 text-primary focus:ring-primary/20 border-input rounded"
              />
            </div>

            {/* Current price */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current AVN price</p>
                <p className="text-base font-medium">
                  {currentAvnPrice ? `$${currentAvnPrice.toFixed(7)}` : 'Unknown'}
                </p>
                {priceLastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Updated: {priceLastUpdated.toLocaleTimeString()} (locally stored)
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshPrice}
                disabled={isRefreshingPrice}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingPrice ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Threshold setting */}
            <div className="space-y-3">
              <label
                htmlFor="priceThreshold"
                className="block text-sm font-medium"
              >
                Price change threshold (%)
              </label>
              <input
                type="range"
                id="priceThreshold"
                min="1"
                max="20"
                step="1"
                value={preferences.priceAlertThreshold}
                onChange={(e) =>
                  handlePreferenceChange('priceAlertThreshold', parseInt(e.target.value))
                }
                disabled={!isEnabled || preferences.priceAlerts === false}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1%</span>
                <span className="font-medium text-primary">
                  {preferences.priceAlertThreshold}%
                </span>
                <span>20%</span>
              </div>

              {/* Add informational text when price alerts are disabled */}
              {preferences.priceAlerts === false && (
                <div className="flex items-center gap-2 p-3 bg-caution/10 border border-caution/30 rounded-md">
                  <AlertCircle className="w-4 h-4 text-caution" />
                  <p className="text-xs text-caution">
                    Price alerts are currently disabled
                  </p>
                </div>
              )}
              {preferences.priceAlerts !== false && (
                <p className="text-xs text-muted-foreground">
                  You&apos;ll be notified when AVN price changes by {preferences.priceAlertThreshold}%
                  or more.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Note: Price checks occur approximately every 15 minutes due to CoinGecko API rate
                limits. All notification settings are stored locally for privacy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Browser Notification Help */}
      {isEnabled && (
        <div className="mt-6">
          <BrowserNotificationHelp />
        </div>
      )}

      {/* Wallet-specific notification settings */}
      {isEnabled && (
        <div className="space-y-3">
          <h3 className="text-base font-medium">
            Wallet-specific Notifications
          </h3>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              <WalletNotificationsList
                walletNotifications={walletNotifications}
                toggleWalletNotifications={toggleWalletNotifications}
                activeWalletAddress={activeWalletAddress || ''}
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Enable or disable local notifications for specific wallets. Settings are stored only on
            your device for privacy.
          </p>
        </div>
      )}

      {/* Activity logs have been removed for security reasons */}
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
                <Bell className="w-5 h-5 mr-2 text-primary" />
                Notification Settings
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col flex-1 overflow-y-auto p-4">{renderContent()}</div>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center">
              <Bell className="w-5 h-5 mr-2 text-primary" />
              Notification Settings
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 overflow-y-auto p-4">{renderContent()}</div>
        </DialogContent>
      </Dialog>
    );
  }

  // Standalone usage
  return renderContent();
}

// Component to display list of wallets with notification toggles
function WalletNotificationsList({
  walletNotifications,
  toggleWalletNotifications,
  activeWalletAddress,
}: {
  walletNotifications: { [address: string]: boolean };
  toggleWalletNotifications: (address: string, enabled: boolean) => void;
  activeWalletAddress: string;
}) {
  // Get all wallets from local storage
  const [wallets, setWallets] = useState<Array<{ address: string; name?: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadWallets = async () => {
      setLoading(true);
      try {
        // First try to get wallets from IndexedDB through StorageService
        const StorageService = await import('@/services/core/StorageService').then(
          (module) => module.StorageService,
        );
        const storedWallets = await StorageService.getAllWallets();

        if (storedWallets && storedWallets.length > 0) {
          // Format wallets data to match expected structure
          const formattedWallets = storedWallets.map((wallet) => ({
            address: wallet.address,
            name: wallet.name,
          }));
          setWallets(formattedWallets);
        } else {
          // Fallback to localStorage if no wallets found in IndexedDB
          const walletsString = localStorage.getItem('wallets');
          if (walletsString) {
            try {
              const parsedWallets = JSON.parse(walletsString);
              setWallets(parsedWallets);
            } catch (error) {
              toast.error('Failed to load wallets from localStorage', {
                description: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      } catch (error) {
        // Final fallback attempt from localStorage
        const walletsString = localStorage.getItem('wallets');
        if (walletsString) {
          try {
            const parsedWallets = JSON.parse(walletsString);
            setWallets(parsedWallets);
          } catch (error) {
            toast.error('Failed to load wallets', {
              description: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadWallets();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Loading wallets...
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No wallets found
      </div>
    );
  }

  return (
    <>
      {wallets.map((wallet, index) => (
        <div
          key={wallet.address}
          className={`flex items-center justify-between p-4 ${wallet.address === activeWalletAddress ? 'bg-accent/50' : ''}`}
        >
          <div className="truncate max-w-xs">
            <p className="text-sm font-medium">
              {wallet.name || `Wallet ${index + 1}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">{wallet.address}</p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={walletNotifications[wallet.address] === true}
              onChange={(e) => toggleWalletNotifications(wallet.address, e.target.checked)}
            />
            <div className="w-9 h-5 bg-input peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-border peer-checked:bg-primary"></div>
          </label>
        </div>
      ))}
    </>
  );
}
