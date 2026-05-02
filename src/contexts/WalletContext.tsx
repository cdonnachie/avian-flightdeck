'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { WalletService } from '@/services/wallet/WalletService';
import { ElectrumService } from '@/services/core/ElectrumService';
import { StorageService } from '@/services/core/StorageService';
import { TransactionClientService } from '@/services/notifications/client/TransactionClientService';
import { CoinSelectionStrategy, EnhancedUTXO } from '@/services/wallet/UTXOSelectionService';
import { walletContextLogger } from '@/lib/Logger';

interface WalletContextType {
  wallet: WalletService | null;
  electrum: ElectrumService | null;
  balance: number;
  address: string;
  isEncrypted: boolean;
  isLoading: boolean;
  isConnected: boolean;
  serverInfo: { url: string; servers: any[] };
  processingProgress: {
    isProcessing: boolean;
    processed: number;
    total: number;
    currentTx?: string;
  };
  generateWallet: (password: string, useMnemonic?: boolean, passphrase?: string) => Promise<void>;
  restoreWallet: (privateKey: string, password?: string) => Promise<void>;
  restoreWalletFromMnemonic: (
    mnemonic: string,
    password: string,
    passphrase?: string,
  ) => Promise<void>;
  importWalletFromDescriptor: (
    name: string,
    descriptor: string,
    password: string,
  ) => Promise<void>;
  sendTransaction: (
    toAddress: string,
    amount: number,
    password?: string,
    options?: {
      strategy?: CoinSelectionStrategy;
      feeRate?: number;
      maxInputs?: number;
      minConfirmations?: number;
    },
  ) => Promise<string>;
  sendTransactionWithManualUTXOs: (
    toAddress: string,
    amount: number,
    manualUTXOs: EnhancedUTXO[],
    password?: string,
    options?: {
      feeRate?: number;
      changeAddress?: string;
      subtractFeeFromAmount?: boolean;
    },
  ) => Promise<string>;
  updateBalance: () => Promise<void>;
  refreshTransactionHistory: () => Promise<void>;
  cleanupMisclassifiedTransactions: () => Promise<number>;
  reprocessTransactionHistory: () => Promise<number>;
  reprocessTransactionHistoryProgressive: (
    onTransactionProcessed?: (transaction: any) => void,
  ) => Promise<number>;
  encryptWallet: (password: string) => Promise<void>;
  decryptWallet: (password: string) => Promise<void>;
  exportPrivateKey: (password?: string) => Promise<string>;
  exportMnemonic: (password?: string) => Promise<string | null>;
  validateMnemonic: (mnemonic: string) => Promise<boolean>;
  getWalletDescriptor: (password: string) => Promise<string>;
  connectToElectrum: () => Promise<void>;
  disconnectFromElectrum: () => Promise<void>;
  selectElectrumServer: (index: number) => Promise<void>;
  testConnection: () => Promise<boolean>;
  reloadActiveWallet: () => Promise<void>;
  deriveAddressesWithBalances: (
    mnemonic: string,
    passphrase?: string,
    accountIndex?: number,
    addressCount?: number,
    addressType?: string,
    changePath?: number,
    coinType?: number,
  ) => Promise<Array<{ path: string; address: string; balance: number; hasTransactions: boolean }>>;

  deriveCurrentWalletAddresses: (
    password: string,
    accountIndex?: number,
    addressCount?: number,
    addressType?: string,
    changePath?: number,
    coinType?: number,
  ) => Promise<Array<{ path: string; address: string; balance: number; hasTransactions: boolean }>>;

  sendFromDerivedAddress: (
    toAddress: string,
    amount: number,
    password: string,
    derivationPath: string,
    options?: {
      strategy?: CoinSelectionStrategy;
      feeRate?: number;
      maxInputs?: number;
      minConfirmations?: number;
    },
  ) => Promise<string>;
  refreshAfterTransaction: (delayMs?: number) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [wallet, setWallet] = useState<WalletService | null>(null);
  const [electrum, setElectrum] = useState<ElectrumService | null>(null);
  const [balance, setBalance] = useState<number>(0); // Initially 0, but will update early with last known balance
  const [address, setAddress] = useState<string>('');
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverInfo, setServerInfo] = useState<{ url: string; servers: any[] }>({
    url: '',
    servers: [],
  });
  const [processingProgress, setProcessingProgress] = useState<{
    isProcessing: boolean;
    processed: number;
    total: number;
    currentTx?: string;
  }>({ isProcessing: false, processed: 0, total: 0 });

  const initializeWallet = async () => {
    try {
      setIsLoading(true);

      // Create shared ElectrumService instance
      const electrumService = new ElectrumService();
      setElectrum(electrumService);

      // Create WalletService with shared ElectrumService
      const walletService = new WalletService(electrumService);
      setWallet(walletService);

      // Update server info
      setServerInfo(walletService.getElectrumServerInfo());

      // Try to connect to ElectrumX server
      try {
        await walletService.connectToElectrum();
        setIsConnected(true);
      } catch (error) {
        walletContextLogger.warn('Failed to connect to ElectrumX server on startup:', error);
        setIsConnected(false);
      }

      // Try to restore existing wallet from multi-wallet system
      const activeWallet = await StorageService.getActiveWallet();

      if (activeWallet) {
        setAddress(activeWallet.address);
        setIsEncrypted(activeWallet.isEncrypted);

        // Set last known balance from local storage before fetching from server
        // This gives users immediate feedback instead of seeing 0
        const lastKnownData = TransactionClientService.getLastKnownBalance(activeWallet.address);
        if (lastKnownData && lastKnownData.balance > 0) {
          setBalance(lastKnownData.balance);
        }

        // Initialize wallet with subscription for real-time updates
        await walletService.initializeWallet(
          activeWallet.address,
          (data) => {
            setBalance(data.balance);
          },
          (processed, total, currentTx) => {
            // Set processing progress during initial transaction loading
            setProcessingProgress({
              isProcessing: total > 0,
              processed,
              total,
              currentTx,
            });
          },
        );

        // Clear processing progress when initialization is complete
        setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
      } else {
        // Clear any existing wallet state
        setAddress('');
        setIsEncrypted(false);
        setBalance(0);
      }

      // Run migration for existing transactions if needed
      try {
        await StorageService.migrateTransactionHistory();
      } catch (error) {
        walletContextLogger.warn('Failed to migrate transaction history:', error);
      }
    } catch (error) {
      walletContextLogger.error('Failed to initialize wallet:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeWallet();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateWallet = async (
    password: string,
    useMnemonic: boolean = true,
    passphrase?: string,
  ) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    // Validate required password
    if (!password || password.length < 8) {
      throw new Error('Password is required and must be at least 8 characters long');
    }

    try {
      setIsLoading(true);
      const newWallet = await wallet.generateWallet(password, useMnemonic, passphrase);
      setAddress(newWallet.address);
      setIsEncrypted(true); // Always encrypted now
      setBalance(0);

      // Save to storage
      await StorageService.setAddress(newWallet.address);
      await StorageService.setPrivateKey(newWallet.privateKey);
      await StorageService.setIsEncrypted(!!password);

      // Initialize wallet with subscription for real-time updates
      await wallet.initializeWallet(
        newWallet.address,
        (data) => {
          setBalance(data.balance);
        },
        (processed, total, currentTx) => {
          // Set processing progress during initial transaction loading
          setProcessingProgress({
            isProcessing: total > 0,
            processed,
            total,
            currentTx,
          });
        },
      );

      // Clear processing progress when initialization is complete
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
    } catch (error) {
      walletContextLogger.error('Failed to generate wallet:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const restoreWallet = async (privateKey: string, password?: string) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      setIsLoading(true);
      const restoredWallet = await wallet.restoreWallet(privateKey, password);
      setAddress(restoredWallet.address);
      setIsEncrypted(!!password);

      // Save to storage
      await StorageService.setAddress(restoredWallet.address);
      await StorageService.setPrivateKey(restoredWallet.privateKey);
      await StorageService.setIsEncrypted(!!password);

      // Set the last known balance first for immediate feedback (if available)
      const lastKnownData = TransactionClientService.getLastKnownBalance(restoredWallet.address);
      if (lastKnownData && lastKnownData.balance > 0) {
        setBalance(lastKnownData.balance);
      }

      // Initialize wallet with subscription for real-time updates
      await wallet.initializeWallet(
        restoredWallet.address,
        (data) => {
          setBalance(data.balance);
        },
        (processed, total, currentTx) => {
          // Set processing progress during initial transaction loading
          setProcessingProgress({
            isProcessing: total > 0,
            processed,
            total,
            currentTx,
          });
        },
      );

      // Clear processing progress when initialization is complete
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
    } catch (error) {
      walletContextLogger.error('Failed to restore wallet:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const restoreWalletFromMnemonic = async (
    mnemonic: string,
    password: string,
    passphrase?: string,
  ) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    // Validate required password
    if (!password || password.length < 8) {
      throw new Error('Password is required and must be at least 8 characters long');
    }

    try {
      setIsLoading(true);
      const restoredWallet = await wallet.generateWalletFromMnemonic(
        mnemonic,
        password,
        passphrase,
      );
      setAddress(restoredWallet.address);
      setIsEncrypted(true); // Always encrypted now

      // Save to storage
      await StorageService.setAddress(restoredWallet.address);
      await StorageService.setPrivateKey(restoredWallet.privateKey);
      await StorageService.setIsEncrypted(true); // Always encrypted now

      // Set the last known balance first for immediate feedback (if available)
      const lastKnownData = TransactionClientService.getLastKnownBalance(restoredWallet.address);
      if (lastKnownData && lastKnownData.balance > 0) {
        setBalance(lastKnownData.balance);
      }

      // Initialize wallet with subscription for real-time updates
      await wallet.initializeWallet(
        restoredWallet.address,
        (data) => {
          setBalance(data.balance);
        },
        (processed, total, currentTx) => {
          // Set processing progress during initial transaction loading
          setProcessingProgress({
            isProcessing: total > 0,
            processed,
            total,
            currentTx,
          });
        },
      );

      // Clear processing progress when initialization is complete
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
    } catch (error) {
      walletContextLogger.error('Failed to restore wallet from mnemonic:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const sendTransaction = async (
    toAddress: string,
    amount: number,
    password?: string,
    options?: {
      strategy?: CoinSelectionStrategy;
      feeRate?: number;
      maxInputs?: number;
      minConfirmations?: number;
    },
  ): Promise<string> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      setIsLoading(true);
      const txId = await wallet.sendTransaction(toAddress, amount, password, options);

      // Immediately update balance
      await updateBalance();

      // Schedule a delayed refresh to account for network propagation
      refreshAfterTransaction(1500);

      return txId;
    } catch (error) {
      walletContextLogger.error('Failed to send transaction:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const sendTransactionWithManualUTXOs = async (
    toAddress: string,
    amount: number,
    manualUTXOs: EnhancedUTXO[],
    password?: string,
    options?: {
      feeRate?: number;
      changeAddress?: string;
      subtractFeeFromAmount?: boolean;
    },
  ): Promise<string> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      setIsLoading(true);
      const txId = await wallet.sendTransactionWithManualUTXOs(
        toAddress,
        amount,
        manualUTXOs,
        password,
        options,
      );

      // Immediately update balance
      await updateBalance();

      // Schedule a delayed refresh to account for network propagation
      refreshAfterTransaction(1500);

      return txId;
    } catch (error) {
      walletContextLogger.error('Failed to send transaction with manual UTXOs:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateBalance = useCallback(async () => {
    if (!wallet || !address) return;

    try {
      // Force a fresh balance check from the Electrum server
      // Adding a forceRefresh parameter to bypass any caching
      const newBalance = await wallet.getBalance(address, true);

      // Update the balance in the UI
      setBalance(newBalance);

      // Also update the last known balance in local storage
      try {
        const { TransactionClientService } = await import(
          '@/services/notifications/client/TransactionClientService'
        );
        TransactionClientService.saveLastKnownBalance(newBalance, address);
      } catch (storageError) {
        walletContextLogger.error('Failed to update last known balance in storage:', storageError);
      }
    } catch (error) {
      walletContextLogger.error('Failed to update balance:', error);
    }
  }, [wallet, address]);

  // Comprehensive refresh after transaction with delay for network propagation
  const refreshAfterTransaction = useCallback(
    async (delayMs: number = 1500) => {
      if (!wallet || !address) return;

      try {
        // Wait for network to propagate the transaction
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Force refresh balance from network (bypassing cache)
        await updateBalance();

        walletContextLogger.debug('Wallet state refreshed after transaction');
      } catch (error) {
        walletContextLogger.error('Failed to refresh wallet state after transaction:', error);
      }
    },
    [wallet, address, updateBalance],
  );

  const encryptWallet = async (password: string) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      await wallet.encryptWallet(password);
      setIsEncrypted(true);
      await StorageService.setIsEncrypted(true);
    } catch (error) {
      walletContextLogger.error('Failed to encrypt wallet:', error);
      throw error;
    }
  };

  const decryptWallet = async (password: string) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      await wallet.decryptWallet(password);
      setIsEncrypted(false);
      await StorageService.setIsEncrypted(false);
    } catch (error) {
      walletContextLogger.error('Failed to decrypt wallet:', error);
      throw error;
    }
  };

  const exportPrivateKey = async (password?: string): Promise<string> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      return await wallet.exportPrivateKey(password);
    } catch (error) {
      walletContextLogger.error('Failed to export private key:', error);
      throw error;
    }
  };

  const exportMnemonic = async (password?: string): Promise<string | null> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      return await wallet.exportMnemonic(password);
    } catch (error) {
      walletContextLogger.error('Failed to export mnemonic:', error);
      throw error;
    }
  };

  const validateMnemonic = async (mnemonic: string): Promise<boolean> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      return await wallet.validateMnemonic(mnemonic);
    } catch (error) {
      walletContextLogger.error('Failed to validate mnemonic:', error);
      return false;
    }
  };

  const connectToElectrum = async () => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      setIsLoading(true);
      await wallet.connectToElectrum();
      setIsConnected(true);
      setServerInfo(wallet.getElectrumServerInfo());
    } catch (error) {
      walletContextLogger.error('Failed to connect to ElectrumX server:', error);
      setIsConnected(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFromElectrum = async () => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      await wallet.disconnectFromElectrum();
      setIsConnected(false);
    } catch (error) {
      walletContextLogger.error('Failed to disconnect from ElectrumX server:', error);
      throw error;
    }
  };

  const selectElectrumServer = async (index: number) => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      setIsLoading(true);
      await wallet.selectElectrumServer(index);
      setIsConnected(wallet.isConnectedToElectrum());
      setServerInfo(wallet.getElectrumServerInfo());
    } catch (error) {
      walletContextLogger.error('Failed to select ElectrumX server:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async (): Promise<boolean> => {
    if (!wallet) throw new Error('Wallet service not initialized');

    try {
      const result = await wallet.testElectrumConnection();
      setIsConnected(result);
      return result;
    } catch (error) {
      walletContextLogger.error('Connection test failed:', error);
      setIsConnected(false);
      return false;
    }
  };

  const reloadActiveWallet = async () => {
    try {
      // Get the previous address to unsubscribe from
      const previousAddress = address;

      // Get the new active wallet
      const activeWallet = await StorageService.getActiveWallet();

      if (activeWallet) {
        setAddress(activeWallet.address);
        setIsEncrypted(activeWallet.isEncrypted);

        // Update balance for new active wallet
        if (wallet) {
          // If we have a previous address and it's different from the new one,
          // unsubscribe from the old address first
          if (previousAddress && previousAddress !== activeWallet.address) {
            try {
              await wallet.unsubscribeFromWalletUpdates(previousAddress);
            } catch (unsubError) {
              walletContextLogger.error('Error unsubscribing from previous wallet:', unsubError);
              // Continue despite error
            }
          }

          // Set the last known balance first for immediate feedback
          // Read directly from localStorage to avoid scoping issues with imports
          try {
            const balancesStr = localStorage.getItem('lastKnownBalances');
            if (balancesStr && activeWallet.address) {
              const balances = JSON.parse(balancesStr);
              if (balances[activeWallet.address] && balances[activeWallet.address].balance > 0) {
                setBalance(balances[activeWallet.address].balance);
              }
            }
          } catch (error) {
            walletContextLogger.error('Error reading last known balance:', error);
          }

          // Get the balance for the newly active wallet
          // Force refresh to ensure we get the latest balance from the server
          const newBalance = await wallet.getBalance(activeWallet.address, true);
          setBalance(newBalance);

          // Save the initial balance for this wallet if we're switching to it
          // This prevents false balance change notifications when switching wallets
          const { TransactionClientService } = await import(
            '@/services/notifications/client/TransactionClientService'
          );
          TransactionClientService.saveLastKnownBalance(newBalance, activeWallet.address);

          // Subscribe to updates for the new wallet address immediately
          try {
            await wallet.subscribeToWalletUpdates(activeWallet.address, (data) => {
              // Update UI when wallet has updates
              if (data && data.balance !== undefined) {
                setBalance(data.balance);

                // Also update the last known balance when we get updates
                import('@/services/notifications/client/TransactionClientService').then(
                  ({ TransactionClientService }) => {
                    TransactionClientService.saveLastKnownBalance(
                      data.balance,
                      activeWallet.address,
                    );
                  },
                );
              }
            });
          } catch (subError) {
            walletContextLogger.error('Error subscribing to wallet updates:', subError);
            // Continue despite error
          }

          // Clear any previous processing state
          setProcessingProgress({
            isProcessing: false,
            processed: 0,
            total: 0,
          });

          // Refresh transaction history for the active wallet
          // This ensures we're displaying transactions specific to this wallet
          setTimeout(() => {
            // Create a separate local progress tracker for wallet switching
            // to avoid affecting the main repair indicator
            let switchProgress = { processed: 0, total: 0 };

            wallet
              .refreshTransactionHistory(activeWallet.address, (processed, total, currentTx) => {
                // Update local progress tracker but don't show in UI
                // during normal wallet switching operations
                switchProgress = { processed, total };
                // Only log progress but don't update UI
              })
              .then(() => {
                // Don't change the processing state - we've kept it as false

                // Update balance again after refreshing transactions
                // Force refresh to ensure we get the latest balance from the server
                wallet
                  .getBalance(activeWallet.address, true)
                  .then(async (finalBalance) => {
                    setBalance(finalBalance);

                    // Update the saved balance after refreshing transactions
                    const { TransactionClientService } = await import(
                      '@/services/notifications/client/TransactionClientService'
                    );
                    TransactionClientService.saveLastKnownBalance(
                      finalBalance,
                      activeWallet.address,
                    );

                    // We've already subscribed to the wallet updates earlier
                    // so no need to do it again here
                  })
                  .catch((err) => walletContextLogger.error('Error updating balance:', err));
              })
              .catch((error) => {
                walletContextLogger.error('Error refreshing transaction history:', error);
                setProcessingProgress({
                  isProcessing: false,
                  processed: 0,
                  total: 0,
                });
              });
          }, 100); // Small delay to ensure UI updates first
        }
      } else {
        setAddress('');
        setIsEncrypted(false);
        setBalance(0);
      }
    } catch (error) {
      walletContextLogger.error('Error reloading active wallet:', error);
    }
  };

  const refreshTransactionHistory = useCallback(async () => {
    if (!wallet || !address) return;

    try {
      await wallet.refreshTransactionHistory(address, (processed, total, currentTx) => {
        // Set processing progress during transaction refresh
        setProcessingProgress({
          isProcessing: total > 0,
          processed,
          total,
          currentTx,
        });
      });
      // Update balance after refreshing transaction history
      await updateBalance();
      // Clear processing progress when done
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
    } catch (error) {
      walletContextLogger.error('Failed to refresh transaction history:', error);
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
    }
  }, [wallet, address, updateBalance]);

  const cleanupMisclassifiedTransactions = useCallback(async (): Promise<number> => {
    if (!wallet || !address) return 0;

    try {
      const cleanedCount = await wallet.cleanupMisclassifiedTransactions(address);

      // Update balance after cleaning up transactions
      await updateBalance();
      return cleanedCount;
    } catch (error) {
      walletContextLogger.error('Failed to cleanup misclassified transactions:', error);
      return 0;
    }
  }, [wallet, address, updateBalance]);

  const reprocessTransactionHistory = useCallback(async (): Promise<number> => {
    if (!wallet || !address) return 0;

    try {
      setProcessingProgress({ isProcessing: true, processed: 0, total: 0 });

      // Run in background without blocking UI
      const processedCount = await wallet.reprocessTransactionHistory(
        address,
        (processed, total, currentTx) => {
          setProcessingProgress({
            isProcessing: true,
            processed,
            total,
            currentTx,
          });
        },
        (newBalance) => {
          // Update balance after processing
          setBalance(newBalance);
        },
      );

      // Update balance after processing transactions
      await updateBalance();

      // Reset progress state
      setProcessingProgress({
        isProcessing: false,
        processed: processedCount,
        total: processedCount,
      });

      return processedCount;
    } catch (error) {
      walletContextLogger.error('Failed to reprocess transaction history:', error);
      setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
      return 0;
    }
  }, [wallet, address, updateBalance]);

  const reprocessTransactionHistoryProgressive = useCallback(
    async (onTransactionProcessed?: (transaction: any) => void): Promise<number> => {
      if (!wallet || !address) return 0;

      try {
        setProcessingProgress({ isProcessing: true, processed: 0, total: 0 });

        // Use the progressive method that processes one transaction at a time
        const processedCount = await wallet.reprocessTransactionHistoryProgressive(
          address,
          (processed, total, currentTx, newTransaction) => {
            // Update progress state
            setProcessingProgress({
              isProcessing: true,
              processed,
              total,
              currentTx,
            });

            // If a new transaction was processed, call the callback
            if (newTransaction && onTransactionProcessed) {
              onTransactionProcessed(newTransaction);
            }
          },
          (newBalance) => {
            // Update balance periodically during processing
            setBalance(newBalance);
          },
        );

        // Update balance after processing transactions
        await updateBalance();

        // Reset progress state
        setProcessingProgress({
          isProcessing: false,
          processed: processedCount,
          total: processedCount,
        });

        return processedCount;
      } catch (error) {
        walletContextLogger.error('Failed to progressively process transaction history:', error);
        setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
        return 0;
      }
    },
    [wallet, address, updateBalance],
  );

  const contextValue: WalletContextType = {
    wallet,
    electrum,
    balance,
    address,
    isEncrypted,
    isLoading,
    isConnected,
    serverInfo,
    processingProgress,
    generateWallet,
    restoreWallet,
    sendTransaction,
    sendTransactionWithManualUTXOs,
    updateBalance,
    encryptWallet,
    decryptWallet,
    exportPrivateKey,
    exportMnemonic,
    connectToElectrum,
    disconnectFromElectrum,
    selectElectrumServer,
    testConnection,
    restoreWalletFromMnemonic,
    importWalletFromDescriptor: async (name: string, descriptor: string, password: string) => {
      if (!wallet) throw new Error('Wallet service not initialized');
      try {
        setIsLoading(true);
        const newWallet = await wallet.importWalletFromDescriptor({ name, descriptor, password, makeActive: true });
        setAddress(newWallet.address);
        setIsEncrypted(true);
        await wallet.initializeWallet(
          newWallet.address,
          (data) => { setBalance(data.balance); },
          (processed, total, currentTx) => {
            setProcessingProgress({ isProcessing: total > 0, processed, total, currentTx });
          },
        );
        setProcessingProgress({ isProcessing: false, processed: 0, total: 0 });
      } catch (error) {
        walletContextLogger.error('Failed to import descriptor wallet:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    validateMnemonic,
    reloadActiveWallet,
    refreshTransactionHistory,
    cleanupMisclassifiedTransactions,
    reprocessTransactionHistory,
    reprocessTransactionHistoryProgressive,
    deriveAddressesWithBalances: async (
      mnemonic,
      passphrase,
      accountIndex,
      addressCount,
      addressType,
      changePath,
    ) => {
      return WalletService.deriveAddressesWithBalances(
        mnemonic,
        passphrase,
        accountIndex,
        addressCount,
        addressType,
        changePath,
      );
    },
    deriveCurrentWalletAddresses: async (
      password,
      accountIndex,
      addressCount,
      addressType,
      changePath,
      coinType,
    ) => {
      if (!wallet) throw new Error('Wallet not initialized');
      return wallet.deriveCurrentWalletAddresses(
        password,
        accountIndex,
        addressCount,
        addressType,
        changePath,
      );
    },
    sendFromDerivedAddress: async (toAddress, amount, password, derivationPath, options) => {
      if (!wallet) throw new Error('Wallet not initialized');
      try {
        setIsLoading(true);
        const txId = await wallet.sendFromDerivedAddress(
          toAddress,
          amount,
          password,
          derivationPath,
          options,
        );

        // Immediately refresh balance
        await updateBalance();

        // Schedule a delayed refresh to account for network propagation
        refreshAfterTransaction(1500);

        return txId;
      } catch (error) {
        walletContextLogger.error('Failed to send transaction from derived address:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    refreshAfterTransaction,
    getWalletDescriptor: async (password: string) => {
      if (!wallet) throw new Error('Wallet not initialized');
      const activeWalletData = await StorageService.getActiveWallet();
      if (!activeWalletData) throw new Error('No active wallet');
      return wallet.getWalletDescriptor(activeWalletData, password);
    },
  };

  return <WalletContext.Provider value={contextValue}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
