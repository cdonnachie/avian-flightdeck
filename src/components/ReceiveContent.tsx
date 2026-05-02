'use client';

import { useState, useEffect, useCallback } from 'react';
import { QrCode, Copy, CheckCircle, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { StorageService } from '@/services/core/StorageService';
import { useWallet } from '@/contexts/WalletContext';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Badge } from '@/components/ui/badge';

interface ReceiveContentProps {
  address: string;
}

interface WalletDisplayItem {
  id?: number;
  address: string;
  name: string;
  isActive: boolean;
}

export default function ReceiveContent({ address }: ReceiveContentProps) {
  // Core states
  const [copied, setCopied] = useState(false);
  const [wallets, setWallets] = useState<WalletDisplayItem[]>([]);

  // SIMPLIFIED: Using direct state management for selected wallet index
  const [selectedWalletIndex, setSelectedWalletIndex] = useState<number>(0);

  // Flag to force selection to active wallet during CRUD operations
  const [forceActiveSelection, setForceActiveSelection] = useState(false);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Carousel API
  const [api, setApi] = useState<any>(null);

  const { reloadActiveWallet } = useWallet();

  // Selected address derived from selected index
  const selectedAddress = wallets[selectedWalletIndex]?.address || null;

  // Function to load all wallets with simplified selection logic
  const loadAllWallets = useCallback(async () => {
    try {
      setIsLoading(true);
      const allWallets = await StorageService.getAllWallets();

      // Format wallets for display
      const displayWallets = allWallets.map((wallet) => ({
        id: wallet.id,
        address: wallet.address,
        name: wallet.name,
        isActive: wallet.isActive,
      }));

      // Special case: No wallets
      if (displayWallets.length === 0) {
        setWallets([]);
        setSelectedWalletIndex(0);
        return;
      }

      // Update wallets state
      setWallets(displayWallets);

      // Now determine which wallet to select based on priority rules:

      // 1. If address prop is explicitly provided (from parent component)
      if (address) {
        const addressIndex = displayWallets.findIndex((w) => w.address === address);
        if (addressIndex !== -1) {
          setSelectedWalletIndex(addressIndex);
          setForceActiveSelection(false);
          return;
        }
      }

      // 2. When forcing active selection (after CRUD operations)
      if (forceActiveSelection) {
        const activeIndex = displayWallets.findIndex((w) => w.isActive);
        if (activeIndex !== -1) {
          setSelectedWalletIndex(activeIndex);
          setForceActiveSelection(false); // Reset flag after using it
          return;
        }
      }

      // 3. Try to use saved selection from localStorage if it exists
      try {
        const savedAddress = localStorage.getItem('user_selected_wallet');
        if (savedAddress) {
          const savedIndex = displayWallets.findIndex((w) => w.address === savedAddress);
          if (savedIndex !== -1) {
            setSelectedWalletIndex(savedIndex);
            setForceActiveSelection(false);
            return;
          }
        }
      } catch (e) {
        // Silent handling of storage errors
      }

      // 4. Fall back to active wallet
      const activeIndex = displayWallets.findIndex((w) => w.isActive);
      if (activeIndex !== -1) {
        setSelectedWalletIndex(activeIndex);
        return;
      }

      // 5. Last resort: first wallet
      setSelectedWalletIndex(0);
    } catch (error) {
      toast.error('Failed to load wallets', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [address, forceActiveSelection]);

  // Load all wallets on component mount and when address changes
  useEffect(() => {
    // Load wallets immediately
    loadAllWallets();
  }, [address, loadAllWallets]);

  // Listen for wallet creation/import/deletion/switch events
  useEffect(() => {
    // Function to reload wallets when a wallet is created or imported
    const handleWalletChanged = () => {
      // For creation/import, we want to select the new active wallet
      setForceActiveSelection(true);
      loadAllWallets();
    };

    // Function to handle wallet switch events
    const handleWalletSwitched = () => {
      // For wallet switching, we want to select the new active wallet
      setForceActiveSelection(true);
      loadAllWallets();
    };

    // Special handler for wallet deletion
    const handleWalletDeleted = (event: Event) => {
      // Get the event details
      const detail = (event as CustomEvent).detail;
      const wasActive = detail?.wasActive || false;
      const deletedWalletAddress = detail?.address;

      // The deleted wallet was the currently selected wallet
      if (selectedAddress && deletedWalletAddress && deletedWalletAddress === selectedAddress) {
        // Clear user selection from localStorage
        try {
          localStorage.removeItem('user_selected_wallet');
        } catch (e) {
          // Silent handling
        }
      }

      // If the deleted wallet was active, we need to force selection of new active wallet
      if (wasActive) {
        setForceActiveSelection(true);
      }

      // Force a reload of all wallets
      loadAllWallets();
    };

    // Listen for relevant events
    window.addEventListener('wallet-created', handleWalletChanged);
    window.addEventListener('wallet-imported', handleWalletChanged);
    window.addEventListener('wallet-switched', handleWalletSwitched);
    window.addEventListener('wallet-deleted', handleWalletDeleted);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('wallet-created', handleWalletChanged);
      window.removeEventListener('wallet-imported', handleWalletChanged);
      window.removeEventListener('wallet-switched', handleWalletSwitched);
      window.removeEventListener('wallet-deleted', handleWalletDeleted);
    };
  }, [loadAllWallets, selectedAddress]);

  // When selected wallet index changes, store it in localStorage
  useEffect(() => {
    if (wallets.length > 0 && selectedWalletIndex >= 0 && selectedWalletIndex < wallets.length) {
      const selected = wallets[selectedWalletIndex];
      if (selected && selected.address) {
        try {
          localStorage.setItem('user_selected_wallet', selected.address);
        } catch (e) {
          // Silent handling of storage errors
        }
      }
    }
  }, [wallets, selectedWalletIndex]);

  // Carousel event handling and synchronization with state
  useEffect(() => {
    if (!api || wallets.length === 0) return;

    // Function to handle carousel select events
    const onCarouselSelect = () => {
      try {
        const carouselIndex = api.selectedScrollSnap();
        if (
          carouselIndex !== selectedWalletIndex &&
          carouselIndex >= 0 &&
          carouselIndex < wallets.length
        ) {
          setSelectedWalletIndex(carouselIndex);
        }
      } catch (e) {
        // Silent error handling
      }
    };

    // Register select event listener
    api.on('select', onCarouselSelect);

    // Make sure the index is valid
    if (selectedWalletIndex < 0 || selectedWalletIndex >= wallets.length) return;

    // Initial carousel position to match the selected index
    try {
      // First attempt - with animation
      api.scrollTo(selectedWalletIndex, true);

      // Verify position after a delay
      setTimeout(() => {
        try {
          if (api.selectedScrollSnap() !== selectedWalletIndex) {
            // Second attempt - without animation for reliability
            api.scrollTo(selectedWalletIndex, false);
          }
        } catch (e) {
          // Silent handling
        }
      }, 150);
    } catch (error) {
      // If the first attempt fails, retry after a delay
      setTimeout(() => {
        try {
          api.scrollTo(selectedWalletIndex, false);
        } catch (e) {
          // Silent handling
        }
      }, 150);
    }

    // Cleanup
    return () => {
      try {
        api.off('select', onCarouselSelect);
      } catch (e) {
        // Silent error handling
      }
    };
  }, [api, selectedWalletIndex, wallets]);

  // Handle wallet switching
  const handleSwitchWallet = async (walletAddress: string) => {
    try {
      // Find the wallet ID from its address
      const wallet = wallets.find((w) => w.address === walletAddress);
      if (!wallet) {
        toast.error('Wallet not found');
        return;
      }

      setIsSwitching(true);

      // Use the same function from StorageService that WalletManager uses
      const success = await StorageService.switchToWallet(wallet.id!);

      if (success) {
        // This is an explicit activation, so force selection of active wallet
        setForceActiveSelection(true);

        // Update the last active wallet to prevent false balance change notifications
        localStorage.setItem('last_active_wallet', wallet.address);

        // Update the global wallet context
        await reloadActiveWallet();

        // Reload all wallets to get updated active status
        await loadAllWallets();

        // Dispatch wallet-switched event to notify other components
        window.dispatchEvent(new CustomEvent('wallet-switched'));

        toast.success('Wallet activated', {
          description: `${wallet.name} is now your active wallet`,
        });
      }
    } catch (error) {
      toast.error('Failed to switch wallet', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSwitching(false);
    }
  };

  // Copy address to clipboard
  const copyToClipboard = async (addressToCopy = selectedAddress) => {
    try {
      if (!addressToCopy) return;

      await navigator.clipboard.writeText(addressToCopy);
      toast.success('Address copied!', {
        description: 'Avian address copied to clipboard',
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy address', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center items-center">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Receive AVN</CardTitle>
          <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <AlertDescription className="text-yellow-600 dark:text-yellow-400 text-sm">
              ⚠️ Do not keep large amounts in your wallet
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 bg-muted rounded-md animate-pulse flex items-center justify-center">
              <QrCode className="w-16 h-16 text-muted-foreground/30" />
            </div>
            <div className="w-full max-w-md space-y-2">
              <div className="h-4 bg-muted rounded animate-pulse"></div>
              <div className="h-10 bg-muted rounded animate-pulse"></div>
            </div>
            <p className="text-muted-foreground">Loading wallets...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedAddress || wallets.length === 0) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center items-center">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Receive AVN</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center space-y-4">
          <div className="bg-muted p-6 rounded-lg flex flex-col items-center space-y-2">
            <QrCode className="w-12 h-12 text-muted-foreground/50" strokeWidth={1} />
            <h3 className="font-medium text-lg">No Wallet Address</h3>
            <p className="text-muted-foreground max-w-xs">
              You need to create or import a wallet to receive AVN.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                // Open the wallet manager via application-level state
                const event = new CustomEvent('openWalletManager', { detail: { tab: 'create' } });
                window.dispatchEvent(event);
              }}
            >
              Create Wallet
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center items-center">
          <QrCode className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Payment Address</CardTitle>
        <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <AlertDescription className="text-yellow-600 dark:text-yellow-400 text-sm">
            ⚠️ Do not keep large amounts in your wallet
          </AlertDescription>
        </Alert>
      </CardHeader>

      <CardContent className="space-y-6 p-3 pt-0 sm:p-6 sm:pt-0">
        {/* QR Code Carousel */}
        {wallets.length > 1 ? (
          <div className="relative">
            <Carousel
              className="w-full max-w-xs mx-auto"
              setApi={setApi}
              opts={{
                align: 'center',
                dragFree: false,
                loop: false,
                skipSnaps: false,
                containScroll: false,
                startIndex: selectedWalletIndex,
              }}
            >
              <CarouselContent>
                {wallets.map((wallet, index) => (
                  <CarouselItem key={wallet.address}>
                    <div className="p-1">
                      <Card
                        className={
                          wallet.isActive
                            ? 'bg-background p-3 shadow-sm border ring-2 ring-primary'
                            : 'bg-background p-3 shadow-sm border'
                        }
                        onClick={() => setSelectedWalletIndex(index)}
                        style={{ cursor: 'pointer' }}
                      >
                        <CardContent className="flex flex-col items-center p-3 space-y-2">
                          <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center bg-white">
                            <QRCodeSVG
                              value={wallet.address}
                              size={224}
                              bgColor="#FFFFFF"
                              fgColor="#1f2937"
                              level="L"
                            />
                          </div>
                          <div className="flex flex-col items-center gap-2 mt-2">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium truncate max-w-[150px]">
                                {wallet.name}
                              </div>
                              {wallet.isActive && (
                                <Badge
                                  variant="outline"
                                  className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700"
                                >
                                  Active
                                </Badge>
                              )}
                              {!wallet.isActive && (
                                <Badge
                                  variant="outline"
                                  className="cursor-pointer hover:text-white hover:bg-accent"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isSwitching) {
                                      handleSwitchWallet(wallet.address);
                                    }
                                  }}
                                >
                                  {isSwitching ? 'Switching...' : 'Set Active'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="-left-3 h-8 w-8 md:-left-5 md:h-10 md:w-10" />
              <CarouselNext className="-right-3 h-8 w-8 md:-right-5 md:h-10 md:w-10" />
            </Carousel>

            <div className="mt-2 flex flex-col items-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Swipe or use arrows to view all wallet addresses
              </p>
              <div className="flex flex-wrap justify-center gap-1 mt-1">
                {wallets.map((wallet, idx) => (
                  <Button
                    key={wallet.address}
                    size="sm"
                    variant={selectedWalletIndex === idx ? 'default' : 'outline'}
                    className="h-7 px-2 min-w-7 rounded-full"
                    onClick={() => setSelectedWalletIndex(idx)}
                    aria-label={`Select wallet ${idx + 1} (${wallet.name})`}
                  >
                    {idx + 1}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Card className="bg-background p-3 shadow-sm border">
              <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
                <QRCodeSVG
                  value={selectedAddress || ''}
                  size={224}
                  bgColor="#FFFFFF"
                  fgColor="#1f2937"
                  level="L"
                />
              </div>
            </Card>
          </div>
        )}

        {/* Address */}
        <div>
          <h3 className="text-base font-medium mb-3 text-center">
            Your Avian Address
            {wallets.length > 1 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({wallets[selectedWalletIndex]?.name || 'Unknown wallet'})
              </span>
            )}
          </h3>
          <div className="flex items-center bg-muted rounded-lg p-3">
            <div className="flex-1 text-sm font-mono break-all">{selectedAddress}</div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`https://flightpath.avn.network/address/${selectedAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 flex"
                    aria-label="Open address in Avian Explorer (opens in new tab)"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>View on Explorer</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => copyToClipboard()}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 ml-1 rounded-full"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Copied!' : 'Copy Address'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>Share this address to receive AVN payments</p>
          <p>Each transaction will be visible on the blockchain</p>
        </div>
      </CardContent>
    </Card>
  );
}
