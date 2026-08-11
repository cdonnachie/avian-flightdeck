import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { EnhancedUTXO } from '@/services/wallet/UTXOSelectionService';
import { StorageService } from '@/services/core/StorageService';
import AuthenticationDialog from '@/components/AuthenticationDialog';
import {
  Coins,
  TrendingUp,
  Check,
  X,
  Clock,
  AlertCircle,
  Info,
  RefreshCcw,
  Filter,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

// Import Shadcn UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface UTXOSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedUTXOs: EnhancedUTXO[]) => void;
  targetAmount?: number; // Optional target amount to help user select enough UTXOs
  initialSelection?: EnhancedUTXO[]; // For restoring a previous selection
  feeRate?: number; // To calculate if enough has been selected
  maxInputs?: number; // Maximum number of UTXOs that can be selected
}

export function UTXOSelector({
  isOpen,
  onClose,
  onSelect,
  targetAmount = 0,
  initialSelection = [],
  feeRate = 10000,
  maxInputs = 500,
}: UTXOSelectorProps) {
  const { wallet, electrum, address, balance, deriveCurrentWalletAddresses } = useWallet();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [utxos, setUtxos] = useState<EnhancedUTXO[]>([]);
  const [selectedUtxos, setSelectedUtxos] = useState<EnhancedUTXO[]>(initialSelection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [enoughSelected, setEnoughSelected] = useState(false);
  const [sortBy, setSortBy] = useState<'value' | 'age'>('value');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Default to smallest first for consolidation
  const [filterDust, setFilterDust] = useState(false);
  const [filterSmall, setFilterSmall] = useState(false);
  const [filterUnconfirmed, setFilterUnconfirmed] = useState(false);
  const [isHdWallet, setIsHdWallet] = useState(false);
  const [loadingHdAddresses, setLoadingHdAddresses] = useState(false);
  const [allAddressesLoaded, setAllAddressesLoaded] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Load UTXOs from the wallet
  const loadUTXOs = useCallback(
    async (forceReload = false) => {
      try {
        setLoading(true);
        setError('');

        if (!electrum || !address) return;

        // If HD addresses are already loaded and this isn't a forced reload, skip
        if (allAddressesLoaded && !forceReload) {
          setLoading(false);
          return;
        }

        // Check if this is an HD wallet
        const storedMnemonic = await StorageService.getMnemonic();
        const hasHdCapabilities = !!storedMnemonic;
        setIsHdWallet(hasHdCapabilities);

        const currentBlockHeight = await electrum.getCurrentBlockHeight();
        let allUTXOs: any[] = [];

        if (hasHdCapabilities) {
          // For HD wallets, start with main address UTXOs only
          const mainUTXOs = await electrum.getUTXOs(address);
          allUTXOs = mainUTXOs.map((utxo: any) => ({
            ...utxo,
            address: address,
            addressType: 'main',
          }));
        } else {
          // For regular wallets, just get UTXOs from the main address
          const mainUTXOs = await electrum.getUTXOs(address);
          allUTXOs = mainUTXOs.map((utxo: any) => ({ ...utxo, address: address }));
        }

        const enhancedUTXOs: EnhancedUTXO[] = allUTXOs.map((utxo: any) => ({
          ...utxo,
          confirmations: utxo.height ? Math.max(0, currentBlockHeight - utxo.height + 1) : 0,
          isConfirmed: utxo.height ? currentBlockHeight - utxo.height + 1 >= 1 : false,
          ageInBlocks: utxo.height ? currentBlockHeight - utxo.height + 1 : 0,
          isDust: utxo.value <= 10000, // 0.0001 AVN threshold (consistent with UTXOOverview)
          address: utxo.address,
        }));

        setUtxos(enhancedUTXOs);
      } catch (err) {
        setError('Failed to load UTXOs');
      } finally {
        setLoading(false);
      }
    },
    [electrum, address, allAddressesLoaded],
  );

  const loadAllHDUTXOs = useCallback(async () => {
    if (!isHdWallet || !deriveCurrentWalletAddresses) return;

    // Show authentication dialog
    setShowAuthDialog(true);
  }, [isHdWallet, deriveCurrentWalletAddresses]);

  const handleAuthentication = useCallback(
    async (password: string) => {
      setShowAuthDialog(false);
      setLoadingHdAddresses(true);
      setError('');

      try {
        const changeAddressCount = await StorageService.getChangeAddressCount();
        const currentBlockHeight = await electrum!.getCurrentBlockHeight();

        // Get both receiving and change addresses
        const [receivingAddresses, changeAddresses] = await Promise.all([
          deriveCurrentWalletAddresses!(password, 0, changeAddressCount, 'p2pkh', 0, 921),
          deriveCurrentWalletAddresses!(password, 0, changeAddressCount, 'p2pkh', 1, 921),
        ]);

        const allAddresses = [...receivingAddresses, ...changeAddresses];
        let allUTXOs: any[] = [];

        // Get UTXOs from all addresses that have balances
        for (const addr of allAddresses) {
          if (addr.balance > 0) {
            try {
              const utxosForAddress = await electrum!.getUTXOs(addr.address);
              const labeledUTXOs = utxosForAddress.map((utxo: any) => ({
                ...utxo,
                address: addr.address,
                addressType: addr.path.includes('(receiving)') ? 'receiving' : 'change',
              }));
              allUTXOs.push(...labeledUTXOs);
            } catch (utxoError) {
              // Skip addresses that can't be queried
            }
          }
        }

        // Also include main wallet address UTXOs
        const mainUTXOs = await electrum!.getUTXOs(address!);
        const labeledMainUTXOs = mainUTXOs.map((utxo: any) => ({
          ...utxo,
          address: address,
          addressType: 'main',
        }));
        allUTXOs.push(...labeledMainUTXOs);

        // Remove duplicates based on txid and vout
        const uniqueUTXOs = allUTXOs.filter(
          (utxo, index, self) =>
            index === self.findIndex((u) => u.txid === utxo.txid && u.vout === utxo.vout),
        );

        const enhancedUTXOs: EnhancedUTXO[] = uniqueUTXOs.map((utxo: any) => ({
          ...utxo,
          confirmations: utxo.height ? Math.max(0, currentBlockHeight - utxo.height + 1) : 0,
          isConfirmed: utxo.height ? currentBlockHeight - utxo.height + 1 >= 1 : false,
          ageInBlocks: utxo.height ? currentBlockHeight - utxo.height + 1 : 0,
          isDust: utxo.value <= 10000,
          address: utxo.address,
        }));

        setUtxos(enhancedUTXOs);
        setAllAddressesLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load HD addresses');
      } finally {
        setLoadingHdAddresses(false);
      }
    },
    [deriveCurrentWalletAddresses, electrum, address],
  );

  const handleAuthCancel = useCallback(() => {
    setShowAuthDialog(false);
    setLoadingHdAddresses(false);
  }, []);

  // Calculate total selected amount
  useEffect(() => {
    const total = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    setSelectedAmount(total);

    // Check if enough is selected to cover target amount
    // Note: We don't include fee in this check because:
    // 1. Fee calculation is complex and depends on final transaction structure
    // 2. SendForm handles fee validation separately
    // 3. This selector just needs to ensure target amount is covered
    setEnoughSelected(total >= targetAmount);
  }, [selectedUtxos, targetAmount]);

  // Load UTXOs when modal opens
  useEffect(() => {
    if (isOpen && electrum && address) {
      loadUTXOs();
    }
  }, [isOpen, electrum, address, loadUTXOs]);

  // Initialize from any provided initial selection
  useEffect(() => {
    if (initialSelection && initialSelection.length > 0) {
      setSelectedUtxos(initialSelection);
    }
  }, [initialSelection]);

  // Toggle UTXO selection
  const toggleSelection = (utxo: EnhancedUTXO) => {
    const isSelected = selectedUtxos.some((u) => u.txid === utxo.txid && u.vout === utxo.vout);
    if (isSelected) {
      setSelectedUtxos(
        selectedUtxos.filter((u) => !(u.txid === utxo.txid && u.vout === utxo.vout)),
      );
    } else {
      setSelectedUtxos([...selectedUtxos, utxo]);
    }
  };

  // Select all UTXOs (limited by maxInputs)
  const selectAll = () => {
    const filteredUTXOs = getSortedFilteredUTXOs();
    const limitedSelection = filteredUTXOs.slice(0, maxInputs);
    setSelectedUtxos(limitedSelection);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedUtxos([]);
  };

  // Sort and filter UTXOs
  const getSortedFilteredUTXOs = () => {
    let filtered = [...utxos];

    // Apply filters
    if (filterDust) {
      filtered = filtered.filter((utxo) => !utxo.isDust);
    }

    if (filterSmall) {
      filtered = filtered.filter((utxo) => utxo.value > 2500000000); // Hide UTXOs under 25 AVN
    }

    if (filterUnconfirmed) {
      filtered = filtered.filter((utxo) => utxo.isConfirmed);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'value') {
        return sortDirection === 'asc' ? a.value - b.value : b.value - a.value;
      } else {
        // age
        const ageA = a.ageInBlocks || 0;
        const ageB = b.ageInBlocks || 0;
        return sortDirection === 'asc' ? ageA - ageB : ageB - ageA;
      }
    });

    return filtered;
  };

  // Format satoshis as AVN with 8 decimal places
  const formatAVN = (satoshis: number) => {
    return (satoshis / 100000000).toFixed(8);
  };

  // Convert confirmations to a user-friendly status
  const getConfirmationStatus = (utxo: EnhancedUTXO) => {
    if (!utxo.confirmations) return 'Unconfirmed';
    if (utxo.confirmations === 1) return '1 confirmation';
    return `${utxo.confirmations} confirmations`;
  };

  // Handle confirm button click
  const handleConfirm = () => {
    onSelect(selectedUtxos);
    onClose();
  };

  if (!isOpen) return null;

  const renderContent = () => (
    <>
      {/* Status and Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 px-2">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Selected Amount:</span>
              <span className="font-mono font-medium">{formatAVN(selectedAmount)} AVN</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Selected UTXOs:</span>
              <Badge variant="outline">
                {selectedUtxos.length} / {utxos.length}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {targetAmount > 0 && (
          <Card
            className={`${enoughSelected ? 'border-primary/30' : 'border-caution/30'}`}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Target Amount:</span>
                <span className="font-mono font-medium">{formatAVN(targetAmount)} AVN</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge
                  variant={enoughSelected ? 'default' : 'outline'}
                  className={
                    enoughSelected
                      ? 'bg-primary hover:bg-primary'
                      : 'text-caution border-caution/30'
                  }
                >
                  {enoughSelected ? 'Sufficient' : 'Insufficient'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Controls */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex gap-2">
          <Button onClick={selectAll} variant="default" size="sm" className="flex-1">
            Select All (max {maxInputs})
          </Button>
          <Button
            onClick={clearSelection}
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={selectedUtxos.length === 0}
          >
            Clear
          </Button>
        </div>
        <Select
          value={`${sortBy}-${sortDirection}`}
          onValueChange={(value) => {
            const [newSortBy, newSortDirection] = value.split('-') as [
              'value' | 'age',
              'asc' | 'desc',
            ];
            setSortBy(newSortBy);
            setSortDirection(newSortDirection);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sort UTXOs" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="value-desc">Largest First</SelectItem>
              <SelectItem value="value-asc">Smallest First</SelectItem>
              <SelectItem value="age-desc">Newest First</SelectItem>
              <SelectItem value="age-asc">Oldest First</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="filter-dust"
            checked={filterDust}
            onCheckedChange={() => setFilterDust(!filterDust)}
          />
          <Label htmlFor="filter-dust" className="text-sm cursor-pointer">
            Hide Dust
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="filter-small"
            checked={filterSmall}
            onCheckedChange={() => setFilterSmall(!filterSmall)}
          />
          <Label htmlFor="filter-small" className="text-sm cursor-pointer">
            Hide Small
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="filter-unconfirmed"
            checked={filterUnconfirmed}
            onCheckedChange={() => setFilterUnconfirmed(!filterUnconfirmed)}
          />
          <Label htmlFor="filter-unconfirmed" className="text-sm cursor-pointer">
            Hide Unconfirmed
          </Label>
        </div>
      </div>

      {/* HD Wallet Warning */}
      {isHdWallet && !allAddressesLoaded && (
        <Alert className="mb-4 bg-caution/10 border-caution/30 text-caution">
          <AlertCircle className="h-4 w-4 text-caution" />
          <AlertTitle>HD Wallet Detected</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Currently showing UTXOs for your main wallet address only. Your funds may be
              distributed across multiple derived addresses (both receiving and change addresses).
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllHDUTXOs}
              disabled={loadingHdAddresses}
              className="bg-caution/10 border-caution/30 text-caution hover:bg-caution/10 dark:hover:bg-caution/10"
            >
              {loadingHdAddresses ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Loading All Addresses...
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4 mr-2" />
                  Load UTXOs from All HD Addresses
                </>
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {allAddressesLoaded && (
        <Alert className="mb-4 bg-primary/10 border-primary/30 text-primary">
          <Check className="h-4 w-4 text-primary" />
          <AlertTitle>All HD Addresses Loaded</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Showing UTXOs from all your HD wallet addresses (main, receiving, and change
              addresses).
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllHDUTXOs}
              disabled={loadingHdAddresses}
              className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/10 dark:hover:bg-primary/10"
            >
              {loadingHdAddresses ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Refresh HD UTXOs
                </>
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading UTXOs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex flex-col space-y-2">
            <p>{error}</p>
            <Button
              onClick={() => loadUTXOs(true)}
              variant="destructive"
              size="sm"
              className="mt-2 self-start"
            >
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty State */}
      {!loading && !error && utxos.length === 0 && (
        <div className="text-center py-8">
          <Info className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">No UTXOs found in this wallet.</p>
        </div>
      )}

      {/* UTXO List */}
      {!loading && !error && utxos.length > 0 && (
        <div className="space-y-2 mt-2 flex-1 overflow-y-auto">
          {getSortedFilteredUTXOs().map((utxo) => {
            const isSelected = selectedUtxos.some(
              (u) => u.txid === utxo.txid && u.vout === utxo.vout,
            );
            return (
              <Card
                key={`${utxo.txid}-${utxo.vout}`}
                onClick={() => toggleSelection(utxo)}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${isSelected ? 'border-primary bg-primary/10' : ''
                  }`}
              >
                <CardContent className="p-3 flex items-center space-x-3">
                  {/* Selection checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(utxo)}
                    className="pointer-events-none"
                  />

                  {/* UTXO Info */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{formatAVN(utxo.value)} AVN</span>
                      <Badge
                        variant={utxo.isDust ? 'outline' : 'secondary'}
                        className={
                          utxo.isDust
                            ? 'bg-caution/10 text-caution border-caution/30'
                            : ''
                        }
                      >
                        {utxo.isDust ? 'Dust' : 'UTXO'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span
                        className="font-mono text-xs text-muted-foreground truncate"
                        style={{ maxWidth: '150px' }}
                      >
                        {utxo.txid.substring(0, 8)}...{utxo.txid.substring(utxo.txid.length - 8)}:
                        {utxo.vout}
                      </span>
                      <span className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        {getConfirmationStatus(utxo)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer Buttons */}
      <div className="mt-6 flex gap-2 justify-end">
        <Button onClick={onClose} variant="secondary">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedUtxos.length === 0 || (targetAmount > 0 && !enoughSelected)}
          className="flex items-center"
        >
          <Check className="w-4 h-4 mr-2" />
          Confirm Selection
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DrawerContent className="h-[90vh] flex flex-col">
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                Manual UTXO Selection
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col flex-1 overflow-hidden p-4">{renderContent()}</div>
          </DrawerContent>
        </Drawer>

        {/* Authentication Dialog for HD Address Loading */}
        <AuthenticationDialog
          isOpen={showAuthDialog}
          onClose={handleAuthCancel}
          onAuthenticate={handleAuthentication}
          title="Load All HD Addresses"
          message="Enter your wallet password to load UTXOs from all derived addresses (receiving and change addresses)."
          walletAddress={address || undefined}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Manual UTXO Selection
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 overflow-hidden">{renderContent()}</div>
        </DialogContent>
      </Dialog>

      {/* Authentication Dialog for HD Address Loading */}
      <AuthenticationDialog
        isOpen={showAuthDialog}
        onClose={handleAuthCancel}
        onAuthenticate={handleAuthentication}
        title="Load All HD Addresses"
        message="Enter your wallet password to load UTXOs from all derived addresses (receiving and change addresses)."
        walletAddress={address || undefined}
      />
    </>
  );
}
