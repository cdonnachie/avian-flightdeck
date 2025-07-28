'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService } from '@/services/core/StorageService';
import { WalletService } from '@/services/wallet/WalletService';
import { useWallet } from '@/contexts/WalletContext';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface TransactionData {
  id?: number;
  txid: string;
  amount: number;
  address: string;
  fromAddress?: string;
  walletAddress?: string; // The wallet this transaction belongs to
  type: 'send' | 'receive';
  timestamp: Date | string; // Can be string when retrieved from database
  confirmations: number;
  blockHeight?: number;
}

// Extended interface to support virtual transaction entries for self-transfers
interface EnhancedTransactionData extends TransactionData {
  isVirtual?: boolean; // Marks this as a UI-only transaction entry
}

// Helper function to check if a transaction is a self-transfer
const isSelfTransfer = (tx: TransactionData, walletAddress: string): boolean => {
  return (
    (tx.address === tx.fromAddress && tx.address === walletAddress) ||
    (tx.walletAddress === tx.fromAddress && tx.fromAddress === tx.address)
  );
};

// Helper function to process transactions for display
const processTransactionsForDisplay = (
  txs: TransactionData[],
  walletAddress: string,
): EnhancedTransactionData[] => {
  const result: EnhancedTransactionData[] = [];

  // Group transactions by txid to help identify self-transfers with potential duplicates
  const txsByTxid = new Map<string, TransactionData[]>();

  // Group all transactions by txid
  txs.forEach((tx) => {
    // Make sure we're only processing transactions that belong to this wallet
    if (tx.walletAddress && tx.walletAddress !== walletAddress) {
      return; // Skip transactions that belong to other wallets
    }

    if (!txsByTxid.has(tx.txid)) {
      txsByTxid.set(tx.txid, []);
    }
    txsByTxid.get(tx.txid)!.push(tx);
  });

  // Process each transaction group
  txsByTxid.forEach((transactions, txid) => {
    // Check if any transaction in this group is a self-transfer
    const selfTransferTxs = transactions.filter((tx) => isSelfTransfer(tx, walletAddress));
    const hasSelfTransfer = selfTransferTxs.length > 0;

    // For self-transfers, we'll add exactly one send and one receive entry
    if (hasSelfTransfer) {
      // Get all unique transactions by type (in case of duplicates)
      // For each type, take only the first transaction to avoid duplicates
      const sendTxs = transactions.filter((tx) => tx.type === 'send');
      const receiveTxs = transactions.filter((tx) => tx.type === 'receive');

      // Take only the first of each type to avoid duplicates
      const sendTx = sendTxs.length > 0 ? sendTxs[0] : null;
      const receiveTx = receiveTxs.length > 0 ? receiveTxs[0] : null;

      // If we don't have a send transaction, create a virtual one from the receive
      if (!sendTx && receiveTx) {
        result.push({
          ...receiveTx,
          type: 'send',
          isVirtual: true,
          id: receiveTx.id ? receiveTx.id * -1 : undefined, // Ensure unique ID
        });
      }
      // If we have a send transaction, add only the first one
      else if (sendTx) {
        result.push(sendTx);
      }

      // If we don't have a receive transaction, create a virtual one from the send
      if (!receiveTx && sendTx) {
        result.push({
          ...sendTx,
          type: 'receive',
          isVirtual: true,
          id: sendTx.id ? sendTx.id * -1 : undefined, // Ensure unique ID
        });
      }
      // If we have a receive transaction, add only the first one
      else if (receiveTx) {
        result.push(receiveTx);
      }
    } else {
      // For regular transactions, deduplicate by type
      // Create a map to track if we've seen a transaction of each type for this txid
      const typesAdded = new Set<string>();

      // Add only the first instance of each transaction type
      transactions.forEach((tx) => {
        // Only add this transaction if we haven't seen its type before
        if (!typesAdded.has(tx.type)) {
          result.push(tx);
          typesAdded.add(tx.type);
        }
      });
    }
  });

  return result;
};

interface TransactionHistoryProps {
  className?: string;
}

export function TransactionHistory({ className }: TransactionHistoryProps) {
  const {
    address,
    refreshTransactionHistory,
    processingProgress,
    reprocessTransactionHistoryProgressive,
  } = useWallet();
  const [transactions, setTransactions] = useState<EnhancedTransactionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'send' | 'receive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20); // Show 20 transactions per page    // Function to refresh transaction history with progress updates
  const refreshTransactionHistoryWithProgress = useCallback(async () => {
    if (!address) return;

    try {
      setIsRefreshing(true);

      // Use the progressive method that updates UI in real-time
      await reprocessTransactionHistoryProgressive();

      // Final reload after processing is complete
      const finalTxHistory = await StorageService.getTransactionHistory(address);
      const finalSorted = finalTxHistory.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      // Process transactions to handle self-transfers
      const enhancedTransactions = processTransactionsForDisplay(finalSorted, address);
      setTransactions(enhancedTransactions);
    } catch (error) {
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [address, reprocessTransactionHistoryProgressive]);

  const loadTransactions = useCallback(async () => {
    if (!address) return;

    try {
      setIsLoading(true);

      // Load from local storage first
      const txHistory = await StorageService.getTransactionHistory(address);
      const sortedTx = txHistory.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      // Process transactions to handle self-transfers
      const enhancedTransactions = processTransactionsForDisplay(sortedTx, address);
      setTransactions(enhancedTransactions);
      setIsLoading(false);

      // Only refresh from blockchain if we have no local data
      if (txHistory.length === 0) {
        try {
          await refreshTransactionHistory();
          // Reload after refresh
          const updatedTxHistory = await StorageService.getTransactionHistory(address);
          const updatedSorted = updatedTxHistory.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );

          // Process transactions to handle self-transfers
          const enhancedTransactions = processTransactionsForDisplay(updatedSorted, address);
          setTransactions(enhancedTransactions);
        } catch (refreshError) {
          toast.warning('Failed to refresh transaction history from blockchain', {
            description: refreshError instanceof Error ? refreshError.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      setIsLoading(false);
    }
  }, [address, refreshTransactionHistory]);

  useEffect(() => {
    const loadTransactionsEffect = async () => {
      await loadTransactions();
      setCurrentPage(1); // Reset to first page when first loading
    };

    loadTransactionsEffect();
  }, [loadTransactions]);

  // Separate effect to handle real-time updates during processing
  useEffect(() => {
    if (!address || !processingProgress.isProcessing) {
      return;
    }

    const updateInterval = setInterval(async () => {
      try {
        const txHistory = await StorageService.getTransactionHistory(address);
        const sortedTx = txHistory.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        // Process transactions to handle self-transfers
        const enhancedTransactions = processTransactionsForDisplay(sortedTx, address);
        setTransactions(enhancedTransactions);
      } catch (error) {
        toast.error('Failed to update transactions during processing', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 3000); // Update every 3 seconds during processing

    return () => clearInterval(updateInterval);
  }, [address, processingProgress.isProcessing]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const formatAmount = (amount: number, type: 'send' | 'receive') => {
    const sign = type === 'send' ? '-' : '+';
    const color =
      type === 'send' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
    return (
      <span className={`font-medium ${color}`}>
        {sign}
        {amount.toFixed(8)} AVN
      </span>
    );
  };

  const formatDate = (date: Date | string) => {
    const now = new Date();
    // Ensure we have a proper Date object
    const txDate = new Date(date);

    // Check if the date is valid
    if (isNaN(txDate.getTime())) {
      return 'Unknown date';
    }

    const diffMs = now.getTime() - txDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return txDate.toLocaleDateString();
  };

  const getStatusIcon = (confirmations: number | undefined) => {
    const numConfirmations = Number(confirmations) || 0;
    if (numConfirmations === 0) {
      return <Clock className="w-4 h-4 text-yellow-500" />;
    } else if (numConfirmations < 6) {
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
    } else {
      return <Check className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusText = (confirmations: number | undefined) => {
    const numConfirmations = Number(confirmations) || 0;

    if (numConfirmations === 0) return 'Pending';
    if (numConfirmations < 6) return `${numConfirmations}/6 confirmations`;
    return 'Confirmed';
  };

  const openExplorer = (txid: string) => {
    // Open the transaction in the Avian block explorer
    WalletService.openTransactionInExplorer(txid);
  };

  return (
    <Card className={`w-full max-w-4xl mx-auto ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Transaction History</CardTitle>
          <Button
            onClick={refreshTransactionHistoryWithProgress}
            disabled={isRefreshing || processingProgress.isProcessing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing || processingProgress.isProcessing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">
              {isRefreshing || processingProgress.isProcessing ? 'Refreshing...' : 'Refresh'}
            </span>
          </Button>
        </div>
      </CardHeader>

      {/* Filter Controls */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Tabs
          defaultValue={filter}
          onValueChange={(value) => setFilter(value as 'all' | 'send' | 'receive')}
        >
          <TabsList className="w-full h-auto rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              All ({transactions.length})
            </TabsTrigger>
            <TabsTrigger
              value="receive"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <span className="text-green-600 dark:text-green-400">
                Received ({transactions.filter((tx) => tx.type === 'receive').length})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="send"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <span className="text-red-600 dark:text-red-400">
                Sent ({transactions.filter((tx) => tx.type === 'send').length})
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Processing Progress */}
        {processingProgress.isProcessing && processingProgress.total > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-4 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Processing transaction history...
              </span>
              <span className="text-xs text-blue-700 dark:text-blue-300">
                {processingProgress.processed}/{processingProgress.total}
              </span>
            </div>
            <Progress
              value={
                processingProgress.total > 0
                  ? (processingProgress.processed / processingProgress.total) * 100
                  : 0
              }
              className="h-2"
            />
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              New transactions will appear as they&apos;re processed
            </div>
            {processingProgress.currentTx && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">
                Processing: {processingProgress.currentTx.slice(0, 16)}...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction List */}
      <CardContent className="p-0">
        <div className="max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-300">Loading transactions...</span>
            </div>
          ) : paginatedTransactions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500 mb-2">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {filter === 'all' ? 'No transactions found' : `No ${filter} transactions found`}
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
                Transactions will appear here once you start using your wallet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedTransactions.map((tx) => (
                <div
                  key={`${tx.id || tx.txid}-${tx.type}${tx.isVirtual ? '-virtual' : ''}`}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Transaction Icon */}
                      <div
                        className={`flex-shrink-0 p-2 rounded-full ${tx.type === 'send'
                          ? 'bg-red-100 dark:bg-red-900/20'
                          : 'bg-green-100 dark:bg-green-900/20'
                          }`}
                      >
                        {tx.type === 'send' ? (
                          <ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4 text-green-600 dark:text-green-400" />
                        )}
                      </div>

                      {/* Transaction Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-white capitalize">
                            {tx.type}
                          </span>
                          {getStatusIcon(tx.confirmations)}
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {getStatusText(tx.confirmations)}
                          </span>
                        </div>

                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {tx.type === 'send' ? 'To: ' : 'From: '}
                          <span className="font-mono break-all">
                            {(() => {
                              const displayAddress =
                                tx.type === 'send' ? tx.address : tx.fromAddress || tx.address;
                              return displayAddress.length > 40
                                ? `${displayAddress.slice(0, 20)}...${displayAddress.slice(-20)}`
                                : displayAddress;
                            })()}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(tx.timestamp)}
                          </span>
                          <button
                            onClick={() => openExplorer(tx.txid)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="flex-shrink-0 text-right">
                      {formatAmount(tx.amount, tx.type)}
                      {tx.blockHeight && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Block #{tx.blockHeight}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Footer with Pagination */}
      <CardFooter className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredTransactions.length)} of{' '}
            {filteredTransactions.length}{' '}
            {filter === 'all' ? 'transactions' : `${filter} transactions`}
          </span>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={prevPage}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {(() => {
                  const maxVisiblePages = 5;
                  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                  if (endPage - startPage + 1 < maxVisiblePages) {
                    startPage = Math.max(1, endPage - maxVisiblePages + 1);
                  }

                  const pages = [];

                  if (startPage > 1) {
                    pages.push(
                      <Button
                        key={1}
                        onClick={() => goToPage(1)}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        1
                      </Button>,
                    );
                    if (startPage > 2) {
                      pages.push(
                        <span key="ellipsis1" className="px-1">
                          ...
                        </span>,
                      );
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <Button
                        key={i}
                        onClick={() => goToPage(i)}
                        variant={i === currentPage ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {i}
                      </Button>,
                    );
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(
                        <span key="ellipsis2" className="px-1">
                          ...
                        </span>,
                      );
                    }
                    pages.push(
                      <Button
                        key={totalPages}
                        onClick={() => goToPage(totalPages)}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {totalPages}
                      </Button>,
                    );
                  }

                  return pages;
                })()}
              </div>

              <Button
                onClick={nextPage}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button
            onClick={async () => {
              // If we have many transactions, use progressive refresh
              if (transactions.length > 100) {
                await refreshTransactionHistoryWithProgress();
              } else {
                await loadTransactions();
              }
            }}
            disabled={processingProgress.isProcessing}
            variant="link"
            size="sm"
          >
            {processingProgress.isProcessing ? 'Processing...' : 'Refresh'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
