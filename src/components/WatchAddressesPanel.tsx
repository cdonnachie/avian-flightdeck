'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useNotifications } from '@/contexts/NotificationContext';
import WatchAddressService, { WatchAddress } from '@/services/wallet/WatchAddressService';
import { RefreshCw, Clipboard, Trash2, Eye, Save, BellRing, Minus, Plus } from 'lucide-react';
import { StorageService } from '@/services/core/StorageService';

// Shadcn UI components
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

export default function WatchAddressesPanel() {
  const { address } = useWallet();
  const { isEnabled } = useNotifications();

  const [watchedAddresses, setWatchedAddresses] = useState<WatchAddress[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notificationThreshold, setNotificationThreshold] = useState<number>(0.01);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [isThresholdLoading, setIsThresholdLoading] = useState<boolean>(true);

  // Load watched addresses
  const loadWatchedAddresses = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      const addresses = await WatchAddressService.getWatchedAddresses(address);
      setWatchedAddresses(addresses);
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to load watched addresses',
      });
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Refresh balances for all watched addresses
  const refreshBalances = async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      await WatchAddressService.refreshWatchAddressBalances(address);
      await loadWatchedAddresses(); // Reload to get updated balances
      toast.success('Success', {
        description: 'Balances refreshed successfully',
      });
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to refresh balances',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Add new watched address
  const addWatchAddress = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast.error('Error', {
        description: 'No active wallet found',
      });
      return;
    }

    if (!newAddress || newAddress.trim() === '') {
      toast.error('Error', {
        description: 'Please enter a valid address',
      });
      return;
    }

    // Don't allow watching own address
    if (newAddress.trim() === address) {
      toast.error('Error', {
        description: 'You cannot watch your own wallet address',
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await WatchAddressService.addWatchAddress(
        address,
        newAddress.trim(),
        newLabel.trim(),
      );

      if (result) {
        setNewAddress('');
        setNewLabel('');
        toast.success('Success', {
          description: 'Address added successfully',
        });
        loadWatchedAddresses();
      } else {
        toast.error('Error', {
          description: 'Failed to add address',
        });
      }
    } catch (error) {
      toast.error('Error', {
        description: 'An error occurred while adding the address',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Remove watched address
  const removeWatchAddress = async (watchAddress: string) => {
    if (!address) return;

    setIsLoading(true);

    try {
      const result = await WatchAddressService.removeWatchAddress(address, watchAddress);

      if (result) {
        toast.success('Success', {
          description: 'Address removed successfully',
        });
        // Update local state to avoid refetching
        setWatchedAddresses((prev) => prev.filter((item) => item.watch_address !== watchAddress));
      } else {
        toast.error('Error', {
          description: 'Failed to remove address',
        });
      }
    } catch (error) {
      toast.error('Error', {
        description: 'An error occurred while removing the address',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update notification types
  const updateNotificationTypes = async (watchAddress: string, types: string[]) => {
    if (!address) return;

    setIsLoading(true);
    try {
      await WatchAddressService.updateWatchAddressNotifications(address, watchAddress, types);
      loadWatchedAddresses();
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to update notification preferences',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Convert from logarithmic slider value (0-100) to actual threshold value (0.01-100000)
  const sliderToThreshold = useCallback((sliderVal: number): number => {
    // Map slider 0-100 to threshold 0.01-100000 logarithmically
    // Using formula: threshold = minThreshold * (maxThreshold/minThreshold)^(sliderVal/100)
    const minThreshold = 0.01;
    const maxThreshold = 100000;
    const logRange = Math.log(maxThreshold / minThreshold);

    return parseFloat((minThreshold * Math.exp((logRange * sliderVal) / 100)).toFixed(2));
  }, []);

  // Convert from threshold value (0.01-100000) to logarithmic slider value (0-100)
  const thresholdToSlider = useCallback((thresholdVal: number): number => {
    const minThreshold = 0.01;
    const maxThreshold = 100000;
    const logRange = Math.log(maxThreshold / minThreshold);

    // Ensure threshold is within valid range
    const clampedThreshold = Math.max(minThreshold, Math.min(maxThreshold, thresholdVal));

    return Math.round((Math.log(clampedThreshold / minThreshold) / logRange) * 100);
  }, []);

  // Function to handle slider change
  const handleSliderChange = useCallback(
    (newSliderValue: number[]) => {
      const value = newSliderValue[0];
      setSliderValue(value);
      setNotificationThreshold(sliderToThreshold(value));
    },
    [sliderToThreshold],
  );

  // Function to increment/decrement threshold by a meaningful amount
  const adjustThreshold = useCallback(
    (direction: 'increase' | 'decrease') => {
      const currentValue = notificationThreshold;
      let newValue: number;

      // Calculate a reasonable step size based on the current value
      // Smaller values need smaller steps, larger values need larger steps
      if (direction === 'increase') {
        if (currentValue < 0.1) newValue = parseFloat((currentValue + 0.01).toFixed(2));
        else if (currentValue < 1) newValue = parseFloat((currentValue + 0.1).toFixed(1));
        else if (currentValue < 10) newValue = parseFloat((currentValue + 1).toFixed(0));
        else if (currentValue < 100) newValue = parseFloat((currentValue + 10).toFixed(0));
        else if (currentValue < 1000) newValue = parseFloat((currentValue + 100).toFixed(0));
        else newValue = parseFloat((currentValue + 1000).toFixed(0));
      } else {
        if (currentValue <= 0.1)
          newValue = Math.max(0.01, parseFloat((currentValue - 0.01).toFixed(2)));
        else if (currentValue <= 1) newValue = parseFloat((currentValue - 0.1).toFixed(1));
        else if (currentValue <= 10) newValue = parseFloat((currentValue - 1).toFixed(0));
        else if (currentValue <= 100) newValue = parseFloat((currentValue - 10).toFixed(0));
        else if (currentValue <= 1000) newValue = parseFloat((currentValue - 100).toFixed(0));
        else newValue = parseFloat((currentValue - 1000).toFixed(0));
      }

      // Update both the threshold and the slider position
      setNotificationThreshold(newValue);
      setSliderValue(thresholdToSlider(newValue));
    },
    [notificationThreshold, thresholdToSlider],
  );

  // Save notification threshold
  const saveNotificationThreshold = async () => {
    try {
      // Update the settings in storage
      const settings = await StorageService.getSettings();
      settings.watchedAddressThreshold = notificationThreshold;
      await StorageService.setSettings(settings);

      toast.success('Threshold updated', {
        description: `You'll be notified of balance changes greater than ${notificationThreshold} AVN`,
      });
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to save notification threshold',
      });
    }
  };

  // Load notification threshold
  useEffect(() => {
    const loadThreshold = async () => {
      try {
        setIsThresholdLoading(true);
        const settings = await StorageService.getSettings();
        if (settings.watchedAddressThreshold !== undefined) {
          // Convert to number and ensure it's valid
          const threshold = parseFloat(settings.watchedAddressThreshold);
          if (!isNaN(threshold)) {
            setNotificationThreshold(threshold);
            // Also set the slider position based on the threshold
            setSliderValue(thresholdToSlider(threshold));
          }
        }
      } catch (error) {
        toast.error('Error', {
          description: 'Failed to load notification threshold',
        });
      } finally {
        setIsThresholdLoading(false);
      }
    };

    loadThreshold();
  }, [thresholdToSlider]);

  // Load data on component mount or when wallet changes
  useEffect(() => {
    if (address) {
      loadWatchedAddresses();
    }
  }, [address, loadWatchedAddresses]);

  // Validate if notifications are enabled
  if (!isEnabled) {
    return (
      <Alert className="bg-caution/10 border-caution/30">
        <AlertDescription className="text-caution">
          Enable notifications to monitor other wallet addresses.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="flex flex-col space-y-3 pb-4 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0">
          <CardTitle className="text-lg sm:text-xl font-bold">Add a Watch Address</CardTitle>
          {watchedAddresses.length > 0 && (
            <Button
              onClick={refreshBalances}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="h-8 w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Balances
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 sm:px-6">
        {/* Notification Threshold Setting */}
        <Card className="mb-4 bg-muted/30">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
              <div className="flex items-center">
                <BellRing className="h-4 w-4 mr-2 text-primary" />
                <h3 className="text-sm font-medium">Notification Threshold</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-full sm:w-auto"
                onClick={saveNotificationThreshold}
                disabled={isThresholdLoading}
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustThreshold('decrease')}
                  disabled={isThresholdLoading || notificationThreshold <= 0.01}
                  className="h-8 w-8 flex-shrink-0"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Slider
                  disabled={isThresholdLoading}
                  value={[sliderValue]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={handleSliderChange}
                  className="flex-grow"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjustThreshold('increase')}
                  disabled={isThresholdLoading || notificationThreshold >= 100000}
                  className="h-8 w-8 flex-shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>0.01 AVN</span>
                <span className="font-medium text-foreground text-sm">
                  {notificationThreshold < 0.1
                    ? notificationThreshold.toFixed(2)
                    : notificationThreshold < 100
                      ? notificationThreshold.toFixed(1)
                      : notificationThreshold.toFixed(0)}{' '}
                  AVN
                </span>
                <span>100,000 AVN</span>
              </div>

              <p className="text-xs text-muted-foreground text-center sm:text-left">
                You&apos;ll be notified when a watched address balance changes by at least{' '}
                {notificationThreshold < 0.1
                  ? notificationThreshold.toFixed(2)
                  : notificationThreshold < 100
                    ? notificationThreshold.toFixed(1)
                    : notificationThreshold.toFixed(0)}{' '}
                AVN.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Add New Address Form */}
        <form onSubmit={addWatchAddress} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="watchAddress" className="text-sm font-medium">
              Wallet Address
            </Label>
            <Input
              id="watchAddress"
              type="text"
              placeholder="Enter wallet address to watch"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label" className="text-sm font-medium">
              Label (Optional)
            </Label>
            <Input
              id="label"
              type="text"
              placeholder="E.g., Cold Storage or Family Wallet"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={isLoading}
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={isLoading || !newAddress.trim()} className="w-full h-10">
            {isLoading ? 'Adding...' : 'Add Address'}
          </Button>
        </form>

        <Separator className="my-6" />

        {/* Watched Addresses List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-lg">Your Watched Addresses</h3>
          </div>

          {watchedAddresses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No addresses being watched yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {watchedAddresses.map((item) => (
                <Card key={item.watch_address} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                        <div className="w-full space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="font-medium text-base">{item.label}</h4>
                            <Badge variant="default" className="px-2 py-1">
                              <Eye className="h-3 w-3 mr-1" />
                              Watching
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 w-full">
                            <code className="text-xs font-mono truncate flex-1 text-muted-foreground bg-muted px-2 py-1 rounded">
                              {item.watch_address}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(item.watch_address);
                                toast.success('Copied', {
                                  description: 'Address copied to clipboard',
                                });
                              }}
                              className="h-8 w-8 flex-shrink-0"
                            >
                              <Clipboard className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="bg-muted/50 p-2 rounded">
                            <p className="text-sm font-medium">
                              Balance:{' '}
                              <span className="font-bold text-primary">{item.balance?.toFixed(8) || '0'} AVN</span>
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeWatchAddress(item.watch_address)}
                          disabled={isLoading}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>

                      <Separator />

                      {/* Notification Options */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Notifications:</p>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`balance-${item.watch_address}`}
                            checked={item.notification_types?.includes('balance') ?? true}
                            onCheckedChange={(checked: boolean | 'indeterminate') => {
                              const current = item.notification_types || ['balance'];
                              const updated =
                                checked === true
                                  ? [...current, 'balance'].filter((v, i, a) => a.indexOf(v) === i)
                                  : current.filter((t) => t !== 'balance');
                              updateNotificationTypes(item.watch_address, updated);
                            }}
                          />
                          <Label
                            htmlFor={`balance-${item.watch_address}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            Balance Changes
                          </Label>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
