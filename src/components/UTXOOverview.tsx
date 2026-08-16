import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { EnhancedUTXO, UTXOSelectionService } from '@/services/wallet/UTXOSelectionService';
import { StorageService } from '@/services/core/StorageService';
import AuthenticationDialog from '@/components/AuthenticationDialog';
import { UTXOSelector } from '@/components/UTXOSelector';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Clock,
  Check,
  X,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Shuffle,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface UTXOOverviewProps {
  isOpen: boolean;
  onClose: () => void;
  onConsolidateUTXOs?: (selectedUTXOs: EnhancedUTXO[]) => void; // Optional callback for consolidation
  maxInputs?: number; // Maximum number of inputs for consolidation (default 500)
}

export function UTXOOverview({ isOpen, onClose, onConsolidateUTXOs, maxInputs = 500 }: UTXOOverviewProps) {
  const { wallet, electrum, address, balance, deriveCurrentWalletAddresses } = useWallet();
  const [utxos, setUtxos] = useState<EnhancedUTXO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHdWallet, setIsHdWallet] = useState(false);
  const [loadingHdAddresses, setLoadingHdAddresses] = useState(false);
  const [allAddressesLoaded, setAllAddressesLoaded] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [totalHdBalance, setTotalHdBalance] = useState<number>(0);
  const [showConsolidationSelector, setShowConsolidationSelector] = useState(false);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const isMobile = useMediaQuery('(max-width: 768px)');

  const formatAVN = (satoshis: number) => {
    return (satoshis / 100000000).toFixed(8);
  };

  const formatTxId = (txid: string) => {
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  };

  const getConfirmationIcon = (confirmations: number) => {
    if (confirmations === 0) return <Clock className="w-4 h-4 text-caution" />;
    if (confirmations < 6) return <AlertCircle className="w-4 h-4 text-caution" />;
    return <Check className="w-4 h-4 text-primary" />;
  };

  const getConfirmationStatus = (confirmations: number) => {
    if (confirmations === 0) return 'Pending';
    if (confirmations < 6) return 'Confirming';
    return 'Confirmed';
  };

  // Column definitions
  const columns: ColumnDef<EnhancedUTXO>[] = useMemo(
    () => [
      {
        accessorKey: 'txid',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="h-auto p-0 font-medium"
            >
              Transaction
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatTxId(row.getValue('txid'))}
          </span>
        ),
      },
      {
        accessorKey: 'vout',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="h-auto p-0 font-medium"
            >
              Output
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => <span className="font-mono">{row.getValue('vout')}</span>,
      },
      {
        accessorKey: 'address',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="h-auto p-0 font-medium"
            >
              Address
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const address = row.getValue('address') as string;
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {address
                ? `${address.substring(0, 8)}...${address.substring(address.length - 8)}`
                : 'Unknown'}
            </span>
          );
        },
      },
      {
        accessorKey: 'value',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="h-auto p-0 font-medium"
            >
              Amount
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const value = row.getValue('value') as number;
          const isDust = value <= 10000;
          const isSmall = value <= 2500000000; // 25 AVN threshold for consolidation consideration
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono">{formatAVN(value)} AVN</span>
              {isDust && (
                <Badge
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/30"
                >
                  Dust
                </Badge>
              )}
              {!isDust && isSmall && (
                <Badge
                  variant="outline"
                  className="bg-caution/10 text-caution border-caution/30"
                >
                  Small
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'confirmations',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="h-auto p-0 font-medium"
            >
              Confirmations
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue('confirmations') || 0}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const confirmations = (row.getValue('confirmations') as number) || 0;
          return (
            <div className="flex items-center gap-2">
              {getConfirmationIcon(confirmations)}
              <span className="text-muted-foreground">
                {getConfirmationStatus(confirmations)}
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: utxos,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: isMobile ? 10 : 20,
      },
    },
  });

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
        const hasHdCapabilities = await StorageService.hasHdCapability();
        setIsHdWallet(hasHdCapabilities);

        const currentBlockHeight = await electrum.getCurrentBlockHeight();
        let allUTXOs: any[] = [];

        if (hasHdCapabilities) {
          // For HD wallets, get UTXOs from all derived addresses with balances
          try {
            // Get change address count preference
            const changeAddressCount = await StorageService.getChangeAddressCount();

            // We'll need a password to derive addresses - for now, just show main wallet
            // In a future update, we could add an authentication dialog here

            // For now, just get UTXOs from the main address
            const mainUTXOs = await electrum.getUTXOs(address);
            allUTXOs = mainUTXOs.map((utxo: any) => ({ ...utxo, address: address }));
          } catch (hdError) {
            // Fallback to main address
            const mainUTXOs = await electrum.getUTXOs(address);
            allUTXOs = mainUTXOs.map((utxo: any) => ({ ...utxo, address: address }));
          }
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
          isDust: utxo.value <= 10000, // 0.0001 AVN threshold (truly uneconomical UTXOs)
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

        // Calculate total balance from all UTXOs
        const totalBalance = enhancedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
        setTotalHdBalance(totalBalance);
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

  // Consolidation handlers
  const handleConsolidateClick = useCallback(() => {
    setShowConsolidationSelector(true);
  }, []);

  const handleConsolidationSelect = useCallback(
    (selectedUTXOs: EnhancedUTXO[]) => {
      setShowConsolidationSelector(false);
      if (onConsolidateUTXOs) {
        onConsolidateUTXOs(selectedUTXOs);
      }
      onClose(); // Close the overview modal
    },
    [onConsolidateUTXOs, onClose],
  );

  const handleConsolidationCancel = useCallback(() => {
    setShowConsolidationSelector(false);
  }, []);

  useEffect(() => {
    if (isOpen && electrum && address) {
      loadUTXOs();
    }
  }, [isOpen, electrum, address, loadUTXOs]);

  if (!isOpen) return null;

  const totalUTXOs = utxos.length;
  const confirmedUTXOs = utxos.filter((u) => u.isConfirmed).length;
  const dustUTXOs = utxos.filter((u) => u.isDust).length;
  const smallUTXOs = utxos.filter((u) => !u.isDust && u.value <= 2500000000).length; // Under 25 AVN but not dust
  const largeUTXOs = utxos.filter((u) => u.value > 100000000).length; // > 1 AVN

  const renderContent = () => (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalUTXOs}</div>
            <div className="text-sm text-muted-foreground">Total UTXOs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {confirmedUTXOs}
            </div>
            <div className="text-sm text-muted-foreground">Confirmed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-caution">
              {smallUTXOs}
            </div>
            <div className="text-sm text-muted-foreground">Small UTXOs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">{dustUTXOs}</div>
            <div className="text-sm text-muted-foreground">Dust UTXOs</div>
          </CardContent>
        </Card>
      </div>

      {/* Balance Information */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Main Wallet Balance:</span>
                <span className="font-mono font-semibold">{formatAVN(balance)} AVN</span>
              </div>
              {allAddressesLoaded && totalHdBalance !== balance && (
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-sm text-muted-foreground">Total HD Balance:</span>
                  <span className="font-mono font-semibold text-primary">
                    {formatAVN(totalHdBalance)} AVN
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">Loading UTXOs...</span>
        </div>
      ) : error ? (
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => loadUTXOs(true)} className="mt-4">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : utxos.length === 0 ? (
        <div className="text-center p-8">
          <Coins className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No UTXOs found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Input */}
          <div className="flex items-center py-4">
            <Input
              placeholder="Filter by transaction ID or address..."
              value={(table.getColumn('txid')?.getFilterValue() as string) ?? ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                table.getColumn('txid')?.setFilterValue(event.target.value)
              }
              className="max-w-sm"
            />
          </div>

          {/* Data Table */}
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        return (
                          <TableHead key={header.id}>
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
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between space-x-2 py-4">
              <div className="flex-1 text-sm text-muted-foreground">
                {table.getFilteredSelectedRowModel().rows.length} of{' '}
                {table.getFilteredRowModel().rows.length} row(s) selected.
              </div>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">
                  Page {table.getState().pagination.pageIndex + 1} of{' '}
                  {table.getPageCount()}
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Page size selector */}
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium">Rows per page</p>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recommendations */}
          {(dustUTXOs > 0 || smallUTXOs > 3) && (
            <Alert className="bg-caution/10 border-caution/30 text-caution">
              <AlertCircle className="h-4 w-4 text-caution" />
              <AlertTitle>UTXO Consolidation Recommended</AlertTitle>
              <AlertDescription className="space-y-3">
                {dustUTXOs > 0 && (
                  <p>You have {dustUTXOs} dust UTXOs (less than 0.0001 AVN each) that may be uneconomical to spend.</p>
                )}
                {smallUTXOs > 3 && (
                  <p>You have {smallUTXOs} small UTXOs (less than 25 AVN each) that would benefit from consolidation.</p>
                )}
                <p>Consider consolidating them in a low-priority transaction to reduce future transaction complexity and fees.</p>
                {(dustUTXOs + smallUTXOs) > maxInputs && (
                  <p className="text-sm font-medium">
                    💡 Note: You have {dustUTXOs + smallUTXOs} eligible UTXOs but can only consolidate {maxInputs} at a time.
                    You may need to repeat this process {Math.ceil((dustUTXOs + smallUTXOs) / maxInputs)} times.
                  </p>
                )}
                {onConsolidateUTXOs && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConsolidateClick}
                    className="bg-caution/10 border-caution/30 text-caution hover:bg-caution/10 dark:hover:bg-caution/10"
                  >
                    <Shuffle className="h-4 w-4 mr-2" />
                    Consolidate UTXOs {(dustUTXOs + smallUTXOs) > maxInputs && `(${maxInputs} max)`}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </>
  );

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <>
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <DrawerContent className="flex flex-col max-h-[95vh]">
            <DrawerHeader className="flex-shrink-0">
              <DrawerTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                UTXO Overview
              </DrawerTitle>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4">{renderContent()}</div>

            <DrawerFooter className="flex-shrink-0">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </DrawerFooter>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              UTXO Overview
            </DialogTitle>
          </DialogHeader>

          {renderContent()}

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
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

      {/* UTXO Consolidation Selector */}
      <UTXOSelector
        isOpen={showConsolidationSelector}
        onClose={handleConsolidationCancel}
        onSelect={handleConsolidationSelect}
        initialSelection={
          // Pre-select dust and small UTXOs, prioritizing smallest first, limited to maxInputs
          utxos
            .filter((utxo) => utxo.isDust || (!utxo.isDust && utxo.value <= 2500000000))
            .sort((a, b) => a.value - b.value) // Sort smallest first for efficient consolidation
            .slice(0, maxInputs) // Limit to maximum inputs
        }
        targetAmount={0} // No specific target for consolidation
        maxInputs={maxInputs}
      />
    </>
  );
}
