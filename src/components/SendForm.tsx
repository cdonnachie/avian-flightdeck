'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  AlertCircle,
  ExternalLink,
  Settings,
  Coins,
  Lock,
  UserCheck,
  Check,
  X,
  ArrowUpFromLine,
  Copy,
  Download,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { WalletService } from '@/services/wallet/WalletService';
import { StorageService } from '@/services/core/StorageService';
import { securityService } from '@/services/core/SecurityService';
import { CoinSelectionStrategy, EnhancedUTXO } from '@/services/wallet/UTXOSelectionService';
import { estimateTxFee, DEFAULT_FEE_RATE_SAT_PER_VBYTE } from '@/services/wallet/fees';
import AddressInput from './AddressInput';
import { QRScanResult } from '@/types/addressBook';
import { UTXOSelectionSettings } from './UTXOSelectionSettings';
import { UTXOOverview } from './UTXOOverview';
import { UTXOSelector } from './UTXOSelector';
import SendReviewDialog from './SendReviewDialog';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import Image from 'next/image';

export default function SendForm() {
  const {
    sendTransaction,
    sendTransactionWithManualUTXOs,
    sendFromDerivedAddress,
    balance,
    isLoading,
    isConnected,
    isEncrypted,
    electrum,
    address,
  } = useWallet();
  const { requireAuth, wasBiometricAuth, storedWalletPassword } = useSecurity();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [usingBiometricAuth, setUsingBiometricAuth] = useState(false);
  const [fromDerivedAddress, setFromDerivedAddress] = useState('');
  const [derivationPath, setDerivationPath] = useState('');
  const [derivedAddressBalance, setDerivedAddressBalance] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [askToSaveAddress, setAskToSaveAddress] = useState(false);
  const [showUTXOSettings, setShowUTXOSettings] = useState(false);
  const [showUTXOOverview, setShowUTXOOverview] = useState(false);
  const [utxoOptions, setUtxoOptions] = useState<{
    strategy?: CoinSelectionStrategy;
    feeRate?: number;
    maxInputs?: number;
    minConfirmations?: number;
  }>({
    strategy: CoinSelectionStrategy.BEST_FIT,
    feeRate: undefined, // undefined = use the wallet default (size-based) fee
    maxInputs: 100,
    minConfirmations: 6,
  });
  const [isConsolidatingToSelf, setIsConsolidatingToSelf] = useState(false);
  const [showUTXOSelector, setShowUTXOSelector] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [manuallySelectedUTXOs, setManuallySelectedUTXOs] = useState<EnhancedUTXO[]>([]);
  const [subtractFeeFromAmount, setSubtractFeeFromAmount] = useState(false);
  const [customChangeAddress, setCustomChangeAddress] = useState('');

  // Unsigned-PSBT export (sign elsewhere — Avian Core, a co-signer — then broadcast).
  const [exportBusy, setExportBusy] = useState(false);
  const [exportedPsbt, setExportedPsbt] = useState('');
  const [exportedInfo, setExportedInfo] = useState<{ fee: number; inputs: number } | null>(null);
  const [copiedExport, setCopiedExport] = useState(false);
  const [availableChangeAddresses, setAvailableChangeAddresses] = useState<
    Array<{ address: string; path: string }>
  >([]);
  const [isHdWallet, setIsHdWallet] = useState(false);
  const [preferredChangeAddressCount, setPreferredChangeAddressCount] = useState(5);
  // Advanced features for HD wallets:
  // - subtractFeeFromAmount: When enabled, transaction fee is deducted from the send amount
  // - customChangeAddress: Allows selecting a specific change address from HD wallet's change addresses
  // - availableChangeAddresses: List of derived change addresses for HD wallets
  // - isHdWallet: Flag indicating if current wallet supports HD features
  const isMobile = useMediaQuery('(max-width: 768px)');

  const validateAddress = (address: string): boolean => {
    if (!address) return false;

    // Native SegWit bech32 (avn1q...)
    if (address.toLowerCase().startsWith('avn1')) {
      // bech32 charset: 0-9 a-z (no b i o)
      const bech32Regex = /^avn1[ac-hj-np-z02-9]{6,87}$/i;
      return bech32Regex.test(address);
    }

    // Legacy P2PKH — base58, starts with 'R', 26-35 chars
    if (!address.startsWith('R') || address.length < 26 || address.length > 35) {
      return false;
    }
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    return base58Regex.test(address);
  };

  const openExplorer = (txid: string) => {
    WalletService.openTransactionInExplorer(txid);
  };

  // Export is only meaningful for the standard path — the shared planner selects from the main
  // wallet address automatically, so a derived-address send or a manual UTXO pick isn't reflected.
  const canExportUnsigned =
    !fromDerivedAddress && utxoOptions.strategy !== CoinSelectionStrategy.MANUAL;

  const handleExportUnsigned = async () => {
    setError('');
    setExportedPsbt('');
    setExportedInfo(null);
    if (!toAddress || !validateAddress(toAddress)) {
      setError('Enter a valid recipient address before exporting a PSBT.');
      return;
    }
    const amountSatoshis = Math.floor(parseFloat(amount) * 100000000);
    if (!amountSatoshis || amountSatoshis <= 0) {
      setError('Enter an amount before exporting a PSBT.');
      return;
    }
    if (!isConnected || !electrum) {
      setError('Not connected to the Avian network. Please check your connection.');
      return;
    }
    setExportBusy(true);
    try {
      const service = new WalletService(electrum);
      const result = await service.buildUnsignedPsbt(toAddress, amountSatoshis, {
        strategy: utxoOptions.strategy,
        feeRate: utxoOptions.feeRate,
        changeAddress: customChangeAddress || undefined,
        subtractFeeFromAmount,
      });
      setExportedPsbt(result.psbt);
      setExportedInfo({ fee: result.fee, inputs: result.inputs });
    } catch (err: any) {
      setError(err?.message || 'Failed to build the unsigned PSBT.');
    } finally {
      setExportBusy(false);
    }
  };

  const copyExportedPsbt = async () => {
    try {
      await navigator.clipboard.writeText(exportedPsbt);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
      toast.success('Unsigned PSBT copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const downloadExportedPsbt = () => {
    const blob = new Blob([exportedPsbt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'avian-unsigned.psbt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSuccessTxId('');

    // Only validate on actual form submission
    if (!toAddress || !amount) {
      setError('Please fill in all fields');
      return;
    }

    // If using manual UTXO selection, make sure UTXOs have been selected
    if (
      utxoOptions.strategy === CoinSelectionStrategy.MANUAL &&
      manuallySelectedUTXOs.length === 0
    ) {
      setError('Please select UTXOs for your transaction');
      setShowUTXOSelector(true);
      return;
    }

    if (!isConnected) {
      setError('Not connected to Avian network. Please check your connection.');
      return;
    }

    if (!validateAddress(toAddress)) {
      setError('Invalid Avian address. Address must start with "R" and be 26-35 characters long.');
      return;
    }

    const amountSatoshis = Math.floor(parseFloat(amount) * 100000000);
    // Estimated fee for the preflight guard only — the service computes the exact size-based fee.
    // Assume a couple of inputs for automatic selection, or the actual count for manual.
    const feeRateSatPerVb = utxoOptions.feeRate || DEFAULT_FEE_RATE_SAT_PER_VBYTE;
    const estInputs =
      utxoOptions.strategy === CoinSelectionStrategy.MANUAL
        ? Math.max(1, manuallySelectedUTXOs.length)
        : 2;
    const fee = estimateTxFee(estInputs, 2, feeRateSatPerVb);

    if (amountSatoshis <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    let balanceToCheck: number;

    // Determine which balance to check based on the transaction type
    if (utxoOptions.strategy === CoinSelectionStrategy.MANUAL && manuallySelectedUTXOs.length > 0) {
      // When manually selecting UTXOs, use the total value of selected UTXOs
      balanceToCheck = manuallySelectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
    } else if (fromDerivedAddress) {
      // When sending from a derived address, refresh and use its balance
      const refreshedBalance = await refreshDerivedAddressBalance();
      balanceToCheck = refreshedBalance !== null ? refreshedBalance : derivedAddressBalance || 0;
    } else {
      // Default to main wallet balance
      balanceToCheck = balance;
    }

    // Now check if we have enough funds to cover the fee
    if (balanceToCheck < fee) {
      setError(
        `Insufficient funds to cover the network fee (~${(fee / 100000000).toFixed(8)} AVN). The address has ${balanceToCheck / 100000000} AVN.`,
      );
      return;
    }

    // Enough for the amount plus fee. With "subtract fee" the fee comes out of the amount, so only
    // the amount itself needs to fit.
    const requiredSats = subtractFeeFromAmount ? amountSatoshis : amountSatoshis + fee;
    if (requiredSats > balanceToCheck) {
      const maxSendable = Math.max(0, (balanceToCheck - fee) / 100000000);
      setError(
        `Insufficient funds. Maximum sendable: ${maxSendable.toFixed(8)} AVN (or use "subtract fee" to send the full balance).`,
      );
      return;
    }

    // All checks passed — show the review. Nothing is authorised or signed until the user
    // confirms there; the actual auth + send path (proceedToAuthAndSend) is unchanged.
    setReviewOpen(true);
  };

  // Runs after the user confirms the review: authenticate, then send. Extracted verbatim from the
  // old inline handleSubmit path so the money-moving flow is untouched — only gated by the review.
  const proceedToAuthAndSend = async () => {
    try {
      let authPassword = '';

      if (isEncrypted) {
        const authResult = await requireAuth('Authenticate to send transaction');

        if (!authResult.success || !authResult.password) {
          setError('Authentication required to send transaction');
          setReviewOpen(false);
          return;
        }

        authPassword = authResult.password;
        setUsingBiometricAuth(wasBiometricAuth);
      }

      await sendTransactionWithAuth(authPassword);
      setReviewOpen(false);
    } catch (error: any) {
      setError('Authentication failed: ' + (error.message || 'Unknown error'));
      setReviewOpen(false);
    }
  };

  // Send transaction with authentication
  const sendTransactionWithAuth = async (authPassword: string) => {
    try {
      setIsSending(true);
      setError(''); // Clear any previous errors

      const amountSatoshis = Math.floor(parseFloat(amount) * 100000000);

      // Prepare transaction options including manual UTXO selection if applicable
      const txOptions = {
        ...utxoOptions,
        changeAddress: customChangeAddress || undefined,
        subtractFeeFromAmount: subtractFeeFromAmount,
        manualSelection:
          utxoOptions.strategy === CoinSelectionStrategy.MANUAL ? manuallySelectedUTXOs : undefined,
      };

      let txId: string;

      // Check how to send the transaction based on the context
      if (fromDerivedAddress && derivationPath) {
        // Sending from a specific derived address
        await refreshDerivedAddressBalance();

        // Check that derived address still has enough balance for the transaction
        const currentBalance = derivedAddressBalance || 0;

        if (currentBalance < amountSatoshis + 10000) {
          // amount + minimum fee
          throw new Error(
            `Insufficient funds in derived address. Balance: ${currentBalance / 100000000} AVN, required: ${(amountSatoshis + 10000) / 100000000} AVN`,
          );
        }

        // Send from derived address
        txId = await sendFromDerivedAddress(
          toAddress,
          amountSatoshis,
          authPassword,
          derivationPath.replace(/\s*\(.+\)$/, ''), // Remove any trailing comments like "(receiving)"
          txOptions,
        );

        // Clear derived address params from URL after successful transaction
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else if (
        utxoOptions.strategy === CoinSelectionStrategy.MANUAL &&
        manuallySelectedUTXOs.length > 0
      ) {
        // Manual UTXO selection - use the new sendTransactionWithManualUTXOs method
        const manualTxOptions = {
          feeRate: utxoOptions.feeRate,
          changeAddress: customChangeAddress || undefined,
          subtractFeeFromAmount: subtractFeeFromAmount,
        };
        txId = await sendTransactionWithManualUTXOs(
          toAddress,
          amountSatoshis,
          manuallySelectedUTXOs,
          authPassword,
          manualTxOptions,
        );
      } else {
        // Standard transaction from main wallet address
        txId = await sendTransaction(toAddress, amountSatoshis, authPassword, txOptions);
      }

      // Check if we should ask to save this address after successful transaction
      const savedAddresses = await StorageService.getSavedAddresses();
      const isAddressSaved = savedAddresses.some((addr) => addr.address === toAddress);

      if (!isAddressSaved && validateAddress(toAddress)) {
        setSuccess(
          'Transaction sent successfully! You can save this address to your address book below.',
        );
        setAskToSaveAddress(true);
      } else {
        setSuccess('Transaction sent successfully!');
      }
      setSuccessTxId(txId);

      // Update usage count if address is already saved
      if (isAddressSaved) {
        await StorageService.updateAddressUsage(toAddress);
      }

      // Clear form fields on success but keep authentication state
      setToAddress('');
      setAmount('');
      setSubtractFeeFromAmount(false);
      setCustomChangeAddress('');

      // Reset derived address state if we were using one
      if (fromDerivedAddress && derivationPath) {
        clearDerivedAddressInfo();
      }

      // Clear manually selected UTXOs and reset strategy after successful transaction
      if (utxoOptions.strategy === CoinSelectionStrategy.MANUAL) {
        setManuallySelectedUTXOs([]);
        setShowUTXOSelector(false);
        // Reset strategy back to default
        resetUTXOSettings();
      }

      // Clear consolidation flag if set
      if (isConsolidatingToSelf) {
        setIsConsolidatingToSelf(false);
      }
    } catch (error: any) {
      // Provide more specific error messages
      let errorMessage = 'Failed to send transaction';

      if (error.message) {
        if (error.message.includes('Insufficient funds')) {
          errorMessage = 'Insufficient funds (including network fee)';
        } else if (
          error.message.includes('Invalid password') ||
          error.message.includes('Password required')
        ) {
          errorMessage = error.message.includes('Invalid')
            ? 'Invalid wallet password'
            : 'Password required for encrypted wallet';
          // Authentication is now handled by SecurityContext
          setUsingBiometricAuth(false);
        } else if (error.message.includes('No unspent')) {
          errorMessage = 'No available funds to spend';
        } else if (error.message.includes('broadcast')) {
          errorMessage = 'Failed to broadcast transaction to network';
        } else if (error.message.includes('connection') || error.message.includes('network')) {
          errorMessage = 'Network connection error. Please check your connection and try again.';
        } else if (error.message.includes('Script failed an OP_EQUALVERIFY operation')) {
          errorMessage =
            'Transaction signature verification failed. This may be due to HD wallet address derivation issues.';
        } else if (error.message.includes('mandatory-script-verify-flag-failed')) {
          errorMessage =
            'Transaction script verification failed. Please try again or contact support.';
        } else if (error.message.includes('Could not find derivation path')) {
          errorMessage =
            'Unable to find the correct signing key for one or more UTXOs. Please try selecting different UTXOs.';
        } else {
          errorMessage = error.message;
        }
      }

      // Show toast notification for the error
      toast.error('Transaction Failed', {
        description: errorMessage,
        duration: 6000, // Show longer for errors so users can read them
      });

      setError(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectAddress = (address: string) => {
    setToAddress(address);
  };

  const handleSaveAddressFromTransaction = async (name: string, description?: string) => {
    // Always use the current toAddress, not just on successful transactions
    if (toAddress && validateAddress(toAddress)) {
      try {
        const addressData = {
          id: '',
          name: name.trim(),
          address: toAddress,
          description: description?.trim(),
          dateAdded: new Date(),
          useCount: 1,
          lastUsed: new Date(),
        };

        await StorageService.saveAddress(addressData);
        toast.success('Address saved to address book');
      } catch (err) {
        toast.error('Failed to save address');
      }
    }
    setAskToSaveAddress(false);
  };

  // Handle payment request from QR code
  const handlePaymentRequest = (paymentData: QRScanResult) => {
    // Set the address
    setToAddress(paymentData.address);

    // Set the amount if provided
    if (paymentData.amount) {
      setAmount(paymentData.amount.toString());
    }

    // Clear any errors
    if (error) {
      setError('');
    }

    // Show detailed success toast with payment request information
    let title = '💰 Payment Request Loaded';
    let description = `Address: ${paymentData.address.slice(0, 8)}...${paymentData.address.slice(-8)}`;

    if (paymentData.label) {
      title = `💰 Payment Request: ${paymentData.label}`;
    }

    const details = [];
    if (paymentData.amount) {
      details.push(`Amount: ${paymentData.amount} AVN`);
    }
    if (paymentData.message) {
      details.push(`Message: ${paymentData.message}`);
    }

    if (details.length > 0) {
      description = details.join(' • ');
    }

    toast.success(title, {
      description: description,
      duration: 5000, // Show longer for payment requests
    });
  };

  // Calculate max amount based on the applicable balance (derived address or main address)
  // IMPORTANT: Make sure we're properly checking the derived address balance
  // For manual UTXO selection, use the selected UTXOs total value instead
  let balanceToUse: number;

  if (utxoOptions.strategy === CoinSelectionStrategy.MANUAL && manuallySelectedUTXOs.length > 0) {
    // When manually selecting UTXOs, use the total value of selected UTXOs
    balanceToUse = manuallySelectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
  } else if (fromDerivedAddress) {
    // When sending from a derived address, use its balance
    balanceToUse = derivedAddressBalance !== null ? derivedAddressBalance : 0;
  } else {
    // Default to main wallet balance
    balanceToUse = balance;
  }

  // Full balance — MAX enables "subtract fee", so the exact size-based fee comes out on send.
  const maxAmount = balanceToUse / 100000000;

  // Debug balance information

  const resetUTXOSettings = () => {
    setUtxoOptions({
      strategy: CoinSelectionStrategy.BEST_FIT,
      feeRate: undefined, // undefined = use the wallet default (size-based) fee
      maxInputs: 100,
      minConfirmations: 6,
    });
  };

  // Check if current wallet is HD-compatible (without loading change addresses immediately)
  const checkHdWalletCapabilities = useCallback(async () => {
    try {
      const storedMnemonic = await StorageService.getMnemonic();
      const hasHdCapabilities = !!storedMnemonic;
      setIsHdWallet(hasHdCapabilities);

      if (!hasHdCapabilities) {
        setAvailableChangeAddresses([]);
        setCustomChangeAddress('');
      }
    } catch (error) {
      setIsHdWallet(false);
      setAvailableChangeAddresses([]);
    }
  }, []);

  // Load change addresses only when needed (lazy loading)
  const loadChangeAddresses = useCallback(
    async (forceReload = false) => {
      if (!isHdWallet) {
        return;
      }

      // Get the current preferred count
      const preferredCount = await StorageService.getChangeAddressCount();

      // Check if we already have the right number of addresses (unless forcing reload)
      if (!forceReload && availableChangeAddresses.length === preferredCount) {
        return; // Already have the correct number
      }

      try {
        const authResult = await requireAuth('Please authenticate to load change addresses', true);
        if (authResult.success && authResult.password) {
          try {
            const walletService = new WalletService();
            const changeAddresses = await walletService.deriveCurrentWalletAddresses(
              authResult.password,
              0, // account index
              preferredCount, // number of addresses from preference
              'p2pkh', // address type
              1, // change path (1 for change addresses)
            );

            setAvailableChangeAddresses(
              changeAddresses.map((addr) => ({
                address: addr.address,
                path: addr.path,
              })),
            );
          } catch (error) {
            // Don't show error to user, just disable HD features
            setIsHdWallet(false);
          }
        }
      } catch (error) {
        // User cancelled authentication or error occurred
      }
    },
    [isHdWallet, availableChangeAddresses.length, requireAuth],
  );

  // Force reload change addresses (used when user changes the count preference)
  const reloadChangeAddresses = useCallback(async () => {
    if (isHdWallet) {
      setAvailableChangeAddresses([]);
      await loadChangeAddresses(true);
    }
  }, [isHdWallet, loadChangeAddresses]);

  // Add wallet address to address book
  const addWalletAddressToBook = async () => {
    try {
      const wallet = await StorageService.getActiveWallet();
      if (wallet) {
        const addressData = {
          id: '',
          name: wallet.name,
          address: wallet.address,
          description: '',
          dateAdded: new Date(),
          useCount: 0,
          isOwnWallet: true,
        };

        const success = await StorageService.saveAddress(addressData);
        if (success) {
          setToAddress(wallet.address);
          toast.success('Wallet address added to address book', {
            description: 'You can edit the description in the address book if needed',
          });
        }
      }
    } catch (error) {
      toast.error('Failed to add wallet address to address book', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Handle UTXO consolidation from UTXOOverview component
  const handleConsolidateUTXOs = async (selectedUTXOs: EnhancedUTXO[]) => {
    try {
      // Get the current wallet's address for consolidation
      const wallet = await StorageService.getActiveWallet();
      if (wallet) {
        // Set up manual UTXO selection with the selected UTXOs
        setManuallySelectedUTXOs(selectedUTXOs);
        setUtxoOptions({
          strategy: CoinSelectionStrategy.MANUAL,
          feeRate: undefined, // use the wallet default (size-based) fee
          maxInputs: Math.min(selectedUTXOs.length, 500), // Use all selected UTXOs up to Avian's limit
          minConfirmations: 1, // Lower confirmation requirement for consolidation
        });

        // Set destination to own wallet
        setToAddress(wallet.address);
        setIsConsolidatingToSelf(true);
        setCustomChangeAddress('');

        // Calculate suggested amount (total value minus fee buffer)
        const totalValue = selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
        const suggestedAmount = Math.max(0, (totalValue - 10000) / 100000000); // Leave buffer for fee
        setAmount(suggestedAmount.toFixed(8));

        // Don't auto-open UTXO selector since user already made selection from UTXOOverview
        // setShowUTXOSelector(true); // Removed to prevent reopening

        toast.success('Consolidation Setup Complete', {
          description: `Selected ${selectedUTXOs.length} UTXOs for consolidation (${(totalValue / 100000000).toFixed(8)} AVN total)`,
          duration: 5000,
        });
      }
    } catch (error) {
      toast.error('Failed to set up UTXO consolidation', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Handle UTXO settings changes and auto-fill wallet address for dust consolidation
  const handleUTXOSettingsApply = async (options: any) => {
    setUtxoOptions(options);

    if (options.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST) {
      try {
        // Get the current wallet's address for auto-consolidation
        const wallet = await StorageService.getActiveWallet();
        if (wallet) {
          setToAddress(wallet.address);
          setIsConsolidatingToSelf(true);
          setCustomChangeAddress('');
        }
      } catch (error) {
        toast.error('Failed to get wallet address for consolidation', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else if (options.strategy === CoinSelectionStrategy.MANUAL) {
      setShowUTXOSelector(true);
    } else if (isConsolidatingToSelf) {
      setToAddress('');
      setIsConsolidatingToSelf(false);
    }
  };

  // Initialize and update biometric auth state from security context
  const [biometricsRequired, setBiometricsRequired] = useState(false);

  useEffect(() => {
    const initializeBiometricState = async () => {
      try {
        // Check if biometrics are required for transactions
        const settings = await securityService.getSecuritySettings();
        const isRequiredForTx =
          settings.biometric.enabled && settings.biometric.requireForTransactions;
        setBiometricsRequired(isRequiredForTx);

        // Determine if we should use biometric auth based on settings and context
        const shouldUseBiometric = isRequiredForTx || (wasBiometricAuth && !!storedWalletPassword);

        setUsingBiometricAuth(shouldUseBiometric);
      } catch (error) {
        toast.error('Error initializing biometric state', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    const initializeComponent = async () => {
      await initializeBiometricState();
      await checkHdWalletCapabilities();
    };

    initializeComponent();
  }, [wasBiometricAuth, storedWalletPassword, isEncrypted, checkHdWalletCapabilities]);

  // Initialize password state when component mounts or when storedWalletPassword changes
  useEffect(() => {
    // Auto-fill wallet's own address when using dust consolidation strategy
    const autoFillAddress = async () => {
      if (utxoOptions.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST) {
        try {
          const wallet = await StorageService.getActiveWallet();
          if (wallet) {
            setToAddress(wallet.address);
          }
        } catch (error) {
          toast.error('Failed to auto-fill wallet address', {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    };

    autoFillAddress();
  }, [utxoOptions.strategy]);

  // Clear any persistent errors when component mounts or address/amount fields have content
  useEffect(() => {
    if ((toAddress || amount) && error) {
      setError('');
    }
  }, [toAddress, amount, error]);

  // Listen for change address count preference changes and reload addresses
  useEffect(() => {
    const checkAndUpdatePreference = async () => {
      if (isHdWallet) {
        const currentCount = await StorageService.getChangeAddressCount();
        if (currentCount !== preferredChangeAddressCount) {
          setPreferredChangeAddressCount(currentCount);
          // If we already have addresses but wrong count, reload them
          if (
            availableChangeAddresses.length > 0 &&
            availableChangeAddresses.length !== currentCount
          ) {
            await reloadChangeAddresses();
          }
        }
      }
    };

    checkAndUpdatePreference();

    // Set up a periodic check every 2 seconds to catch preference changes
    const interval = setInterval(checkAndUpdatePreference, 2000);

    // Also listen for storage events (though they may not fire for same-origin changes)
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'avian_wallet_change_addresses_cache') {
        checkAndUpdatePreference();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [
    isHdWallet,
    preferredChangeAddressCount,
    availableChangeAddresses.length,
    reloadChangeAddresses,
  ]);

  // Parse query parameters for derived address functionality and restore state after authentication
  // Function to refresh derived address balance with improved reliability
  const refreshDerivedAddressBalance = async () => {
    if (fromDerivedAddress && isConnected && electrum) {
      try {
        // Try up to 3 times with different force refresh options
        let balance = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (balance === null && attempts < maxAttempts) {
          attempts++;
          try {
            // First attempt with force refresh, subsequent attempts with different cache handling
            balance = await electrum.getBalance(fromDerivedAddress, true);

            // If we got a zero balance but we expect there to be a balance, retry
            if (balance === 0 && derivedAddressBalance && derivedAddressBalance > 0) {
              balance = null; // Force another attempt
              await new Promise((resolve) => setTimeout(resolve, 500)); // Short delay before retry
            }
          } catch (attemptError) {
            await new Promise((resolve) => setTimeout(resolve, 500)); // Short delay before retry
          }
        }

        // If balance is still null after all attempts, throw an error
        if (balance === null) {
          throw new Error('All balance refresh attempts failed');
        }

        setDerivedAddressBalance(balance);

        // Save the balance to localStorage for persistence
        localStorage.setItem('avian_wallet_derived_address_balance', balance.toString());

        // Only show toast if not part of validation
        const isUserInitiated = new Error().stack?.includes('onClick');
        if (isUserInitiated) {
          toast.success('Balance Refreshed', {
            description: `Address ${fromDerivedAddress.substring(0, 6)}...${fromDerivedAddress.substring(fromDerivedAddress.length - 4)} has ${balance / 100000000} AVN`,
            duration: 3000,
          });
        }

        return balance;
      } catch (error) {
        toast.error('Failed to refresh derived address balance', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fall back to stored value as last resort
        const storedBalance = localStorage.getItem('avian_wallet_derived_address_balance');
        if (storedBalance) {
          const parsedBalance = parseInt(storedBalance, 10);

          setDerivedAddressBalance(parsedBalance);
          return parsedBalance;
        }

        return derivedAddressBalance || 0;
      }
    }
    return derivedAddressBalance || 0;
  };

  // Function to clear derived address information from state and localStorage
  const clearDerivedAddressInfo = () => {
    setFromDerivedAddress('');
    setDerivationPath('');
    setDerivedAddressBalance(null);
    // Remove items from localStorage using the keys from the screenshot
    localStorage.removeItem('derivedFromAddress');
    localStorage.removeItem('derivedPath');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  useEffect(() => {
    const loadDerivedAddressState = async () => {
      try {
        if (typeof window !== 'undefined') {
          // Check URL parameters (initial navigation)
          const urlParams = new URLSearchParams(window.location.search);
          const fromParam = urlParams.get('from');
          const pathParam = urlParams.get('path');

          // If we have URL parameters, store them in localStorage to survive authentication
          if (fromParam && pathParam) {
            localStorage.setItem('derivedFromAddress', fromParam);
            localStorage.setItem('derivedPath', decodeURIComponent(pathParam));
            setFromDerivedAddress(fromParam);
            setDerivationPath(decodeURIComponent(pathParam));
          }

          // Check localStorage for persisted derived address information
          const storedAddress = localStorage.getItem('derivedFromAddress');
          const storedPath = localStorage.getItem('derivedPath');

          if (storedAddress && storedPath && (!fromDerivedAddress || !derivationPath)) {
            setFromDerivedAddress(storedAddress);
            setDerivationPath(storedPath);
          }

          // If we have a derived address, fetch its balance
          if ((fromParam || storedAddress) && isConnected && electrum) {
            const addressToUse = fromParam || storedAddress;
            if (addressToUse) {
              try {
                const balance = await electrum.getBalance(addressToUse);

                setDerivedAddressBalance(balance);

                // Show a toast notification
                toast.info('Using Derived Address', {
                  description: `Using address ${addressToUse.substring(0, 6)}...${addressToUse.substring(addressToUse.length - 4)} with ${balance / 100000000} AVN`,
                  duration: 6000,
                });
              } catch (balanceError) {
                toast.error('Failed to fetch derived address balance', {
                  description:
                    balanceError instanceof Error ? balanceError.message : 'Unknown error',
                });
              }
            }
          }
        }
      } catch (error) {
        toast.error('Error setting up derived address', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    loadDerivedAddressState();
  }, [isConnected, electrum, fromDerivedAddress, derivationPath]);

  // Add a separate effect to refresh the derived address balance whenever the component mounts
  // or the connection status changes
  useEffect(() => {
    const refreshBalanceIfNeeded = async () => {
      if (fromDerivedAddress && isConnected) {
        // Force refresh to make sure we have the latest balance
        const newBalance = await refreshDerivedAddressBalance();

        // This is critical - even if the user doesn't click the refresh button,
        // we need to make sure the derived address balance is properly fetched and set
        if (newBalance !== null && newBalance > 0) {
          toast.info('Found derived address balance', {
            description: `Address has ${newBalance / 100000000} AVN available`,
          });
        }
      }
    };

    refreshBalanceIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, fromDerivedAddress]);

  return (
    <Card className="shadow-sm border-0">
      <CardHeader className="pb-2 bg-gradient-to-r from-transparent to-avian-50/30 dark:to-avian-900/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-2 flex items-center">
              <Image
                src="/Avian_logo.svg"
                width={24}
                height={24}
                alt="Avian Logo"
                className="hover:scale-110 transition-transform duration-200 invert-0 dark:invert"
              />
            </div>
            <CardTitle>Transaction</CardTitle>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUTXOOverview(true)}
            className="h-8"
          >
            <Coins className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">UTXOs</span>
            <span className="sm:hidden">UTXOs</span>
          </Button>

          <Button
            variant={
              utxoOptions.strategy !== CoinSelectionStrategy.BEST_FIT ||
                utxoOptions.feeRate != null ||
                utxoOptions.maxInputs !== 100 ||
                utxoOptions.minConfirmations !== 6
                ? 'secondary'
                : 'outline'
            }
            size="sm"
            onClick={() => setShowUTXOSettings(true)}
            className="relative h-8"
          >
            <Settings className="h-4 w-4 mr-2" />
            <span>Advanced</span>
            {(utxoOptions.strategy !== CoinSelectionStrategy.BEST_FIT ||
              utxoOptions.feeRate != null ||
              utxoOptions.maxInputs !== 100 ||
              utxoOptions.minConfirmations !== 6) && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-caution rounded-full"></span>
              )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* UTXO Selection Status */}
        {(utxoOptions.strategy !== CoinSelectionStrategy.BEST_FIT ||
          utxoOptions.feeRate != null ||
          utxoOptions.maxInputs !== 100 ||
          utxoOptions.minConfirmations !== 6) && (
            <div className="mb-4 p-3 bg-secondary/30 border rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center">
                  <Settings className="h-4 w-4 mr-2 text-primary" />
                  <span className="text-sm font-medium">Custom Settings Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetUTXOSettings}
                    className="h-7 text-xs px-2"
                  >
                    Reset
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowUTXOSettings(true)}
                    className="h-7 text-xs px-2 text-primary"
                  >
                    Modify
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs space-y-1">
                {utxoOptions.strategy !== CoinSelectionStrategy.BEST_FIT && (
                  <Badge variant="outline" className="mr-2 mb-1">
                    Strategy: {utxoOptions.strategy?.replace(/_/g, ' ')}
                  </Badge>
                )}
                {utxoOptions.feeRate != null && (
                  <Badge variant="outline" className="mr-2 mb-1">
                    Fee Rate: {utxoOptions.feeRate} sat/vB
                  </Badge>
                )}
                {utxoOptions.maxInputs !== 100 && (
                  <Badge variant="outline" className="mr-2 mb-1">
                    Max Inputs: {utxoOptions.maxInputs}
                  </Badge>
                )}
                {utxoOptions.minConfirmations !== 6 && (
                  <Badge variant="outline" className="mr-2 mb-1">
                    Min Confirmations: {utxoOptions.minConfirmations}
                  </Badge>
                )}
              </div>
            </div>
          )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert
            variant="default"
            className="mb-4 border-primary/20 bg-primary/5"
          >
            <Check className="h-4 w-4 text-primary" />
            <AlertTitle className="text-foreground">{success}</AlertTitle>
            {successTxId && (
              <AlertDescription>
                <div className="space-y-2">
                  <div className="text-xs mt-1 font-mono">
                    Transaction ID:{' '}
                    {successTxId.length > 20
                      ? `${successTxId.slice(0, 10)}...${successTxId.slice(-10)}`
                      : successTxId}
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => openExplorer(successTxId)}
                    className="h-6 p-0 text-primary hover:text-primary/80"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View on Explorer
                  </Button>
                </div>
              </AlertDescription>
            )}
          </Alert>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          name="send-transaction-form"
          autoComplete="off"
        >
          <div className="space-y-2">
            <Label htmlFor="toAddress">To Address</Label>
            <AddressInput
              value={toAddress}
              onChange={(newAddress) => {
                setToAddress(newAddress);

                // Clear error when user starts entering/selecting an address
                if (error) {
                  setError('');
                }

                // Don't show save prompt immediately - we'll ask after successful transaction
                // This improves UX by not interrupting the transaction flow
                setAskToSaveAddress(false);
              }}
              onPaymentRequest={handlePaymentRequest}
              placeholder="Enter Avian address (R... or avn1q...)"
              className="text-sm"
              disabled={isSending}
              error={error.includes('Invalid Avian address')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (AVN)</Label>
            <div className="relative">
              <Input
                type="number"
                id="amount"
                name="amount"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  // Clear error when user starts entering an amount
                  if (error) {
                    setError('');
                  }
                }}
                placeholder="0.00000000"
                step="0.00000001"
                min="0"
                className="pr-16" /* Increased right padding to avoid overlap */
                disabled={isSending}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAmount(maxAmount.toString());
                  setSubtractFeeFromAmount(true); // send the whole balance; fee comes out of it
                }}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 text-xs px-2 text-primary"
                disabled={isSending || maxAmount <= 0}
              >
                MAX
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Max sendable: {maxAmount.toFixed(8)} AVN · fee deducted on send
              {utxoOptions.strategy === CoinSelectionStrategy.MANUAL &&
                manuallySelectedUTXOs.length > 0 && (
                  <span className="block mt-1">
                    Selected UTXOs:{' '}
                    {(
                      manuallySelectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0) / 100000000
                    ).toFixed(8)}{' '}
                    AVN
                  </span>
                )}
              {maxAmount <= 0 && (
                <Badge variant="destructive" className="ml-2">
                  {utxoOptions.strategy === CoinSelectionStrategy.MANUAL &&
                    manuallySelectedUTXOs.length === 0
                    ? 'No UTXOs selected'
                    : 'Insufficient funds for fee'}
                </Badge>
              )}
              {fromDerivedAddress && (
                <span className="flex items-center mt-1">
                  <span>
                    Derived address balance:{' '}
                    {derivedAddressBalance !== null
                      ? (derivedAddressBalance / 100000000).toFixed(8)
                      : 'Loading...'}{' '}
                    AVN
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshDerivedAddressBalance}
                    className="h-5 text-xs ml-1 px-1"
                  >
                    Refresh
                  </Button>
                </span>
              )}
            </p>
          </div>

          {/* Advanced Options Section */}
          <div className="space-y-3 border-t pt-3">
            <div className="text-sm font-medium text-muted-foreground">Advanced Options</div>

            {/* Subtract Fee from Amount */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="subtractFee"
                checked={subtractFeeFromAmount}
                onCheckedChange={(checked) => setSubtractFeeFromAmount(checked as boolean)}
                disabled={isSending}
              />
              <Label htmlFor="subtractFee" className="text-sm cursor-pointer">
                Subtract fee from amount
              </Label>
            </div>
            {subtractFeeFromAmount && (
              <p className="text-xs text-muted-foreground ml-6">
                The recipient will receive less than the amount entered (amount minus transaction
                fee)
              </p>
            )}

            {/* Change Address Selection for HD Wallets */}
            {isHdWallet && (
              <div className="space-y-2">
                <Label htmlFor="changeAddress" className="text-sm">
                  Custom Change Address (Optional)
                </Label>
                <Select
                  value={customChangeAddress || 'default'}
                  onValueChange={(value) =>
                    setCustomChangeAddress(value === 'default' ? '' : value)
                  }
                  onOpenChange={async (open) => {
                    if (open) {
                      // Check if preference has changed and addresses need to be reloaded
                      const currentCount = await StorageService.getChangeAddressCount();
                      if (availableChangeAddresses.length === 0) {
                        // No addresses loaded yet
                        loadChangeAddresses();
                      } else if (availableChangeAddresses.length !== currentCount) {
                        // Count has changed, reload
                        await reloadChangeAddresses();
                      }
                    }
                  }}
                  disabled={isSending || isConsolidatingToSelf}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Use default (sending address)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default (sending address)</SelectItem>
                    {availableChangeAddresses.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Loading change addresses...
                      </div>
                    ) : (
                      availableChangeAddresses.map((addr, index) => (
                        <SelectItem key={addr.address} value={addr.address}>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{addr.address}</span>
                            <span className="text-xs text-muted-foreground">{addr.path}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {isConsolidatingToSelf ? (
                  <p className="text-xs text-muted-foreground">
                    Change address selection is disabled during dust consolidation (all funds go to
                    your wallet)
                  </p>
                ) : customChangeAddress ? (
                  <p className="text-xs text-muted-foreground">
                    Change will be sent to this HD wallet address instead of the sending address
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Show derived address info if sending from one */}
          {fromDerivedAddress && derivationPath && (
            <Alert className="mb-4 border-caution/30 bg-caution/10">
              <Coins className="h-4 w-4 text-caution" />
              <AlertTitle className="text-caution">
                Sending From Derived Address
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Path:</span> {derivationPath}
                </div>
                <div className="text-sm font-mono break-all">
                  <span className="font-medium font-sans">Address:</span> {fromDerivedAddress}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Balance:</span>{' '}
                  {derivedAddressBalance !== null
                    ? (derivedAddressBalance / 100000000).toFixed(8)
                    : 'Loading...'}{' '}
                  AVN
                  <Button
                    variant="link"
                    size="sm"
                    onClick={refreshDerivedAddressBalance}
                    className="ml-2 p-0 h-6 text-xs"
                  >
                    Refresh
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearDerivedAddressInfo}
                  className="mt-2 text-xs"
                >
                  Cancel & Use Main Address
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Display authentication requirement for encrypted wallets */}
          {isEncrypted && (
            <Alert className="mb-4 border-primary/20 bg-primary/5">
              <Lock className="h-4 w-4 text-primary" />
              <AlertTitle className="text-foreground">
                {biometricsRequired
                  ? 'Biometric Authentication Required'
                  : 'Wallet Authentication Required'}
              </AlertTitle>
              <AlertDescription>
                {biometricsRequired
                  ? "You'll be prompted for biometric verification when sending"
                  : "You'll be prompted for wallet password when sending"}
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={isSending || isLoading} className="w-full">
            {isSending ? 'Sending...' : 'Send Transaction'}
          </Button>

          {canExportUnsigned && (
            <div className="mt-3 space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleExportUnsigned}
                disabled={exportBusy || isSending || !isConnected}
                className="w-full gap-2"
              >
                <ArrowUpFromLine className="h-4 w-4" />
                {exportBusy ? 'Building…' : 'Export unsigned PSBT'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Build this transaction without signing — sign it in Avian Core or with a co-signer,
                then broadcast.
              </p>
            </div>
          )}

          {exportedPsbt && (
            <Alert className="mt-4 border-primary/20 bg-primary/5">
              <ArrowUpFromLine className="h-4 w-4 text-primary" />
              <AlertTitle className="flex items-center justify-between text-foreground">
                <span>Unsigned PSBT ready</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setExportedPsbt('');
                    setExportedInfo(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertTitle>
              <AlertDescription className="space-y-3">
                {exportedInfo && (
                  <p className="text-sm text-muted-foreground">
                    {exportedInfo.inputs} input{exportedInfo.inputs === 1 ? '' : 's'} · network fee ≈{' '}
                    <span className="font-mono text-foreground">
                      {(exportedInfo.fee / 100000000).toFixed(8)} AVN
                    </span>
                    . Signing elsewhere does not change these.
                  </p>
                )}
                <Textarea
                  readOnly
                  value={exportedPsbt}
                  rows={4}
                  spellCheck={false}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={copyExportedPsbt} className="gap-2">
                    {copiedExport ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedExport ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={downloadExportedPsbt}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" /> Download .psbt
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </form>

        {/* Save Address Prompt */}
        {askToSaveAddress && (
          <Alert className="mt-4 border-primary/20 bg-primary/5">
            <AlertTitle className="text-foreground">
              💾 Save this address to your address book?
            </AlertTitle>
            <AlertDescription>
              <div className="text-sm mb-3 text-muted-foreground">
                Address: <span className="font-mono break-all">{toAddress}</span>
              </div>
              <div className="mt-3 mb-3">
                <Label htmlFor="contactName" className="text-muted-foreground">
                  Contact Name
                </Label>
                <Input
                  id="contactName"
                  placeholder="Enter contact name"
                  className="mt-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      handleSaveAddressFromTransaction(input.value || 'Contact');
                    }
                  }}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <Button
                  variant="default"
                  onClick={(e) => {
                    const input = document.getElementById('contactName') as HTMLInputElement;
                    handleSaveAddressFromTransaction(input.value || 'Contact');
                  }}
                  className="bg-primary hover:bg-primary/90"
                >
                  💾 Save Address
                </Button>
                <Button variant="secondary" onClick={() => setAskToSaveAddress(false)}>
                  Skip
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* UTXO Selection Settings Modal */}
        <UTXOSelectionSettings
          isOpen={showUTXOSettings}
          onClose={() => setShowUTXOSettings(false)}
          onApply={handleUTXOSettingsApply}
          currentOptions={utxoOptions}
        />

        {/* UTXO Overview Modal */}
        <UTXOOverview
          isOpen={showUTXOOverview}
          onClose={() => setShowUTXOOverview(false)}
          onConsolidateUTXOs={handleConsolidateUTXOs}
          maxInputs={utxoOptions.maxInputs || 100}
        />

        {/* Dust Consolidation Notice */}
        {isConsolidatingToSelf && (
          <Alert className="my-4 border-primary/20 bg-primary/5">
            <Coins className="h-4 w-4 text-primary" />
            <AlertTitle className="text-foreground">
              Dust Consolidation Mode
            </AlertTitle>
            <AlertDescription className="text-muted-foreground text-sm">
              You are consolidating small UTXOs (dust) back to your own wallet address. This helps
              clean up your wallet and may improve performance. Change address selection is disabled
              during consolidation.
            </AlertDescription>
          </Alert>
        )}

        <div className="my-4 text-right">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={addWalletAddressToBook}
            className="text-xs h-auto p-0 ml-auto flex items-center"
          >
            <Coins className="w-3 h-3 mr-1" />
            Save my wallet address to address book
          </Button>
        </div>

        {/* UTXO Selector - Manual Selection of UTXOs */}
        <UTXOSelector
          isOpen={showUTXOSelector}
          onClose={() => setShowUTXOSelector(false)}
          onSelect={(selectedUTXOs) => {
            setManuallySelectedUTXOs(selectedUTXOs);
            if (selectedUTXOs.length > 0) {
              const totalSelected = selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
              // Calculate a suggested amount (leave some for fee)
              const suggestedAmount = ((totalSelected - 10000) / 100000000).toFixed(8);
              if (!amount) {
                setAmount(suggestedAmount);
              }
            }
          }}
          targetAmount={parseFloat(amount || '0') * 100000000}
          initialSelection={manuallySelectedUTXOs}
          feeRate={utxoOptions.feeRate || 10000}
          maxInputs={utxoOptions.maxInputs || 100}
        />

        {(() => {
          const amountSats = Math.floor(parseFloat(amount || '0') * 100000000);
          const feeRateSatPerVb = utxoOptions.feeRate || DEFAULT_FEE_RATE_SAT_PER_VBYTE;
          const estInputs =
            utxoOptions.strategy === CoinSelectionStrategy.MANUAL
              ? Math.max(1, manuallySelectedUTXOs.length)
              : 2;
          const feeSats = estimateTxFee(estInputs, 2, feeRateSatPerVb);
          const totalSats = subtractFeeFromAmount ? amountSats : amountSats + feeSats;
          const recipientSats = subtractFeeFromAmount
            ? Math.max(0, amountSats - feeSats)
            : amountSats;
          const fmt = (s: number) => (s / 100000000).toFixed(8);
          const manualCount = manuallySelectedUTXOs.length;
          const inputsLabel =
            utxoOptions.strategy === CoinSelectionStrategy.MANUAL
              ? `${manualCount} UTXO${manualCount === 1 ? '' : 's'} · manual`
              : 'Automatic · best-fit';
          return (
            <SendReviewDialog
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              onConfirm={proceedToAuthAndSend}
              onEditInputs={() => {
                setReviewOpen(false);
                setShowUTXOSelector(true);
              }}
              isSending={isSending}
              amount={amount}
              toAddress={toAddress}
              feeAVN={fmt(feeSats)}
              totalAVN={fmt(totalSats)}
              recipientReceivesAVN={fmt(recipientSats)}
              subtractFee={subtractFeeFromAmount}
              inputsLabel={inputsLabel}
              changeAddress={customChangeAddress || undefined}
              fromLabel={
                fromDerivedAddress
                  ? `Derived · ${fromDerivedAddress.slice(0, 10)}…${fromDerivedAddress.slice(-6)}`
                  : undefined
              }
            />
          );
        })()}

        {/* Manual UTXO Selection Notice */}
        {utxoOptions.strategy === CoinSelectionStrategy.MANUAL && (
          <div className="mt-3 p-3 bg-caution/10 border border-caution/30 rounded-lg">
            <div className="font-medium mb-2 flex items-center">
              <UserCheck className="w-4 h-4 mr-2" />
              Manual UTXO Selection Active
            </div>
            <div className="space-y-3">
              <div className="text-sm">
                {manuallySelectedUTXOs.length > 0 ? (
                  <div className="space-y-1">
                    <p>
                      <span className="font-medium">{manuallySelectedUTXOs.length} UTXOs selected</span>
                      {' '}totaling{' '}
                      <span className="font-mono font-medium">
                        {(manuallySelectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0) / 100000000).toFixed(8)} AVN
                      </span>
                    </p>
                    {isConsolidatingToSelf && (
                      <p className="text-caution">
                        💰 Consolidation mode: All selected UTXOs will be combined into your wallet
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-caution">No UTXOs selected</p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={() => setShowUTXOSelector(true)}
                  className="h-8 flex items-center"
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  {manuallySelectedUTXOs.length > 0 ? 'View & Modify Selection' : 'Select UTXOs'}
                </Button>
                {manuallySelectedUTXOs.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setManuallySelectedUTXOs([]);
                      setUtxoOptions({
                        strategy: CoinSelectionStrategy.BEST_FIT,
                        feeRate: undefined, // undefined = use the wallet default (size-based) fee
                        maxInputs: 100,
                        minConfirmations: 6,
                      });
                      if (isConsolidatingToSelf) {
                        setToAddress('');
                        setIsConsolidatingToSelf(false);
                      }
                    }}
                    className="h-8 flex items-center"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear Selection
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
