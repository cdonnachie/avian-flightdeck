'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WalletData } from '@/services/wallet/WalletService';
import { StorageService } from '@/services/core/StorageService';
import { useWallet } from '@/contexts/WalletContext';
import {
  Copy,
  Lock,
  Plus,
  KeyRound,
  FileKey,
  Check,
  Info,
  X,
  Shield,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import WalletCreationForm, {
  WalletCreationMode,
  WalletCreationData,
} from '@/components/WalletCreationForm';
import { WalletErrorBoundary } from '@/components/ErrorBoundary';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useMediaQuery } from '@/hooks/use-media-query';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import Image from 'next/image';

// Wallet Card Component
interface WalletCardProps {
  wallet: WalletData;
  isActive: boolean;
  onSwitch: () => void;
  onDelete: () => void;
  onCopy: (address: string) => void;
  isCopied: boolean;
  canDelete: boolean;
  // Wallet name editing props
  editingWalletId: number | null;
  editingWalletName: string;
  isUpdatingName: boolean;
  onEditName: (walletId: number, currentName: string) => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
  onEditingNameChange: (name: string) => void;
}

function WalletCard({
  wallet,
  isActive,
  onSwitch,
  onDelete,
  onCopy,
  isCopied,
  canDelete,
  editingWalletId,
  editingWalletName,
  isUpdatingName,
  onEditName,
  onSaveName,
  onCancelEdit,
  onEditingNameChange,
}: WalletCardProps) {
  const formatDate = (timestamp?: number | Date) => {
    if (!timestamp) return 'Never';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <WalletErrorBoundary
      name="WalletCard"
      isolate={true}
      fallback={
        <Card className="overflow-hidden border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4">
            <div className="text-red-600 dark:text-red-400 text-sm">
              Error loading wallet card. Please refresh the page.
            </div>
          </CardContent>
        </Card>
      }
    >
      <Card
        className={`overflow-hidden group ${isActive ? 'border-avian-500 dark:border-avian-400 shadow-md' : ''}`}
      >
        <CardContent className="p-4">
          <div className="flex justify-between items-start gap-2">
            <div className="space-y-2">
              <div>
                <div className="flex items-center">
                  {editingWalletId === wallet.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingWalletName}
                        onChange={(e) => onEditingNameChange(e.target.value)}
                        className="font-semibold text-lg bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-avian-500 dark:focus:border-avian-400 outline-none flex-1 min-w-0"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onSaveName();
                          } else if (e.key === 'Escape') {
                            onCancelEdit();
                          }
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onSaveName}
                          disabled={isUpdatingName || !editingWalletName.trim()}
                          className="h-6 w-6 p-0"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onCancelEdit}
                          disabled={isUpdatingName}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold text-lg mr-2">{wallet.name}</h3>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditName(wallet.id!, wallet.name)}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {isActive && (
                    <Badge
                      variant="default"
                      className="bg-blue-500 hover:bg-blue-600 h-5 text-xs px-1.5"
                    >
                      Active
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1">
                  {wallet.isEncrypted && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 h-5 px-1.5 text-xs"
                    >
                      <Lock className="h-3 w-3 mr-0.5" /> Encrypted
                    </Badge>
                  )}
                  {wallet.mnemonic && (
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 h-5 px-1.5 text-xs"
                    >
                      <Shield className="h-3 w-3 mr-0.5" /> HD Wallet
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
                <span className="truncate max-w-[150px] sm:max-w-[200px] md:max-w-[250px]">
                  {wallet.address}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0"
                  onClick={() => onCopy(wallet.address)}
                >
                  <Copy className={`h-3 w-3 ${isCopied ? 'text-green-500' : ''}`} />
                </Button>
              </div>

              <div className="flex items-center text-xs text-muted-foreground gap-4">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Created: {formatDate(wallet.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center text-xs text-muted-foreground gap-4">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Last accessed: {formatDate(wallet.lastAccessed)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-shrink-0">
              {!isActive && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-avian-500 hover:bg-avian-600 text-white h-8 px-3"
                  onClick={onSwitch}
                >
                  Switch
                </Button>
              )}

              {canDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 h-8 px-3"
                  onClick={onDelete}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </WalletErrorBoundary>
  );
}

interface WalletManagerProps {
  onWalletSelect?: (wallet: WalletData) => void;
  onClose?: () => void;
}

export function WalletManager({ onWalletSelect, onClose }: WalletManagerProps) {
  const { reloadActiveWallet } = useWallet();
  const { handleError } = useErrorHandler({ component: 'WalletManager' });
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportKeyForm, setShowImportKeyForm] = useState(false);
  const [showImportMnemonicForm, setShowImportMnemonicForm] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletPassword, setNewWalletPassword] = useState('');
  const [newWalletPasswordConfirm, setNewWalletPasswordConfirm] = useState('');
  const [showNewWalletPassword, setShowNewWalletPassword] = useState(false);
  const [showNewWalletPasswordConfirm, setShowNewWalletPasswordConfirm] = useState(false);
  const [importWalletName, setImportWalletName] = useState('');
  const [importWalletPassword, setImportWalletPassword] = useState('');
  const [importWalletPasswordConfirm, setImportWalletPasswordConfirm] = useState('');
  const [showImportWalletPassword, setShowImportWalletPassword] = useState(false);
  const [showImportWalletPasswordConfirm, setShowImportWalletPasswordConfirm] = useState(false);
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importMnemonicPassphrase, setImportMnemonicPassphrase] = useState('');
  const [showImportMnemonicPassphrase, setShowImportMnemonicPassphrase] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [walletToDelete, setWalletToDelete] = useState<number | null>(null);
  const [editingWalletId, setEditingWalletId] = useState<number | null>(null);
  const [editingWalletName, setEditingWalletName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Password validation helper
  const validatePassword = (password: string, confirmPassword: string): string | null => {
    if (!password) {
      return 'Password is required for wallet security';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    // Check for complexity (at least one number, one letter)
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      return 'Password must contain at least one letter and one number';
    }
    return null;
  };

  const loadWallets = useCallback(async () => {
    try {
      setIsLoading(true);
      const allWallets = await StorageService.getAllWallets();
      const active = await StorageService.getActiveWallet();
      setWallets(allWallets);
      setActiveWallet(active);
    } catch (error) {
      handleError(error instanceof Error ? error : new Error('Failed to load wallets'), {
        operation: 'loadWallets',
      });
      // Set empty arrays to avoid infinite loading
      setWallets([]);
      setActiveWallet(null);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  // Listen for wallet switches from other components
  useEffect(() => {
    const handleWalletSwitched = () => {
      loadWallets();
    };

    const handleWalletCreated = () => {
      loadWallets();
    };

    const handleWalletDeleted = () => {
      loadWallets();
    };

    const handleWalletImported = () => {
      loadWallets();
    };

    const handleWalletNameUpdated = () => {
      loadWallets();
    };

    window.addEventListener('wallet-switched', handleWalletSwitched);
    window.addEventListener('wallet-created', handleWalletCreated);
    window.addEventListener('wallet-deleted', handleWalletDeleted);
    window.addEventListener('wallet-imported', handleWalletImported);
    window.addEventListener('wallet-name-updated', handleWalletNameUpdated);

    return () => {
      window.removeEventListener('wallet-switched', handleWalletSwitched);
      window.removeEventListener('wallet-created', handleWalletCreated);
      window.removeEventListener('wallet-deleted', handleWalletDeleted);
      window.removeEventListener('wallet-imported', handleWalletImported);
      window.removeEventListener('wallet-name-updated', handleWalletNameUpdated);
    };
  }, [loadWallets]);

  const handleSwitchWallet = async (walletId: number) => {
    try {
      setIsLoading(true);
      const success = await StorageService.switchToWallet(walletId);
      if (success) {
        // Find the wallet before we reload the context
        const newActiveWallet = wallets.find((w) => w.id === walletId);

        // Reload the wallet context to update the UI
        await reloadActiveWallet();

        // Wait a moment for context to update
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reload local wallet list
        await loadWallets();

        // Dispatch event to notify other components that wallet was switched
        window.dispatchEvent(new CustomEvent('wallet-switched', {
          detail: { walletId }
        }));

        // Load notification settings for the new active wallet
        try {
          const { NotificationClientService } = await import(
            '@/services/notifications/client/NotificationClientService'
          );
          // This ensures notification settings for the new wallet are properly loaded
          if (newActiveWallet) {
            // Update last active wallet to prevent false balance change notifications
            localStorage.setItem('last_active_wallet', newActiveWallet.address);
            const prefs = await NotificationClientService.getWalletNotificationPreferences(
              newActiveWallet.address,
            );
            // Ensure notifications remain enabled if they were previously enabled
            if (prefs && prefs.enabled) {
              await NotificationClientService.setWalletNotificationEnabled(
                newActiveWallet.address,
                true,
              );
            }
          }
        } catch (notifError) {
          const { notificationLogger } = await import('@/lib/Logger');
          notificationLogger.error('Failed to reload notification settings:', notifError);
          // Continue despite error to ensure wallet switch completes
        }

        // Notify parent component about the wallet switch
        if (newActiveWallet && onWalletSelect) {
          onWalletSelect(newActiveWallet);
        }
      }
    } catch (error) {
      toast.error('Failed to switch wallet', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWallet = async () => {
    if (!newWalletName.trim()) return;

    // Validate password
    const passwordValidationError = validatePassword(newWalletPassword, newWalletPasswordConfirm);
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }

    try {
      setIsCreating(true);
      setPasswordError('');

      // Use WalletService to create a proper wallet with real keys
      const { WalletService } = await import('@/services/wallet/WalletService');
      const walletService = new WalletService();

      const newWallet = await walletService.createNewWallet({
        name: newWalletName.trim(),
        password: newWalletPassword, // Now mandatory
        useMnemonic: true, // Generate with BIP39 mnemonic
        makeActive: true,
      });

      await loadWallets();
      setShowCreateForm(false);
      setNewWalletName('');
      setNewWalletPassword('');
      setNewWalletPasswordConfirm('');

      // Reload the wallet context to update the UI
      await reloadActiveWallet();

      // Dispatch event to notify that a new wallet was created
      window.dispatchEvent(new CustomEvent('wallet-created'));

      if (onWalletSelect) {
        onWalletSelect(newWallet);
      }
    } catch (error) {
      toast.error('Failed to create wallet', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWallet = async (walletId: number) => {
    if (wallets.length <= 1) {
      toast.warning('Cannot delete the last wallet');
      return;
    }

    // Open the delete confirmation dialog
    setWalletToDelete(walletId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteWallet = async () => {
    if (walletToDelete === null) return;

    try {
      const wasActive = wallets.find((w) => w.id === walletToDelete)?.isActive || false;
      await StorageService.deleteWallet(walletToDelete);
      await loadWallets();

      // Reload the wallet context to update the UI with the newly selected active wallet
      await reloadActiveWallet();

      // Dispatch event to notify that a wallet was deleted
      // Include information about whether the deleted wallet was active
      window.dispatchEvent(
        new CustomEvent('wallet-deleted', {
          detail: { wasActive },
        }),
      );

      toast.success('Wallet deleted successfully');
    } catch (error) {
      toast.error('Failed to delete wallet', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setWalletToDelete(null);
    }
  };

  const handleImportPrivateKey = async () => {
    if (!importWalletName.trim() || !importPrivateKey.trim()) return;

    // Validate password
    const passwordValidationError = validatePassword(
      importWalletPassword,
      importWalletPasswordConfirm,
    );
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }

    try {
      setIsCreating(true);
      setPasswordError('');

      const { WalletService } = await import('@/services/wallet/WalletService');
      const walletService = new WalletService();

      const newWallet = await walletService.importWalletFromPrivateKey({
        name: importWalletName.trim(),
        privateKey: importPrivateKey.trim(),
        password: importWalletPassword, // Now mandatory
        makeActive: true,
      });

      await loadWallets();
      setShowImportKeyForm(false);
      setImportWalletName('');
      setImportWalletPassword('');
      setImportWalletPasswordConfirm('');
      setImportPrivateKey('');

      await reloadActiveWallet();

      // Dispatch event to notify that a wallet was imported
      window.dispatchEvent(new CustomEvent('wallet-imported'));

      if (onWalletSelect) {
        onWalletSelect(newWallet);
      }
    } catch (error) {
      toast.error('Failed to import wallet', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportMnemonic = async () => {
    if (!importWalletName.trim() || !importMnemonic.trim()) return;

    // Validate password
    const passwordValidationError = validatePassword(
      importWalletPassword,
      importWalletPasswordConfirm,
    );
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }

    try {
      setIsCreating(true);
      setPasswordError('');

      const { WalletService } = await import('@/services/wallet/WalletService');
      const walletService = new WalletService();

      // Create import options
      const importOptions = {
        name: importWalletName.trim(),
        mnemonic: importMnemonic.trim(),
        password: importWalletPassword, // Now mandatory
        makeActive: true,
      };

      // Add BIP39 passphrase if provided
      if (importMnemonicPassphrase.trim()) {
        // Pass the passphrase as an additional parameter
        (importOptions as any).passphrase = importMnemonicPassphrase.trim();
      }

      const newWallet = await walletService.importWalletFromMnemonic(importOptions);

      await loadWallets();
      setShowImportMnemonicForm(false);
      setImportWalletName('');
      setImportWalletPassword('');
      setImportWalletPasswordConfirm('');
      setImportMnemonic('');
      setImportMnemonicPassphrase('');

      await reloadActiveWallet();

      // Dispatch event to notify that a wallet was imported
      window.dispatchEvent(new CustomEvent('wallet-imported'));

      if (onWalletSelect) {
        onWalletSelect(newWallet);
      }
    } catch (error) {
      toast.error('Failed to import wallet from mnemonic', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast.success('Address copied to clipboard', {
        description: 'Wallet address has been copied successfully',
      });

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedAddress(null);
      }, 2000);
    } catch (error) {
      toast.error('Copy Failed', {
        description: error instanceof Error ? error.message : 'Could not copy address to clipboard',
      });
    }
  };

  const handleEditName = (walletId: number, currentName: string) => {
    setEditingWalletId(walletId);
    setEditingWalletName(currentName);
  };

  const handleSaveName = async () => {
    if (!editingWalletId || !editingWalletName.trim()) return;

    setIsUpdatingName(true);
    try {
      // Update the wallet name using StorageService
      const success = await StorageService.updateWalletName(editingWalletId, editingWalletName.trim());

      if (success) {
        // Reload wallets to refresh the UI
        await loadWallets();

        // If this is the active wallet, reload the wallet context
        if (editingWalletId === activeWallet?.id) {
          await reloadActiveWallet();
        }

        // Dispatch event to notify other components that wallet name was updated
        window.dispatchEvent(new CustomEvent('wallet-name-updated', {
          detail: {
            walletId: editingWalletId,
            newName: editingWalletName.trim(),
            isActiveWallet: editingWalletId === activeWallet?.id
          }
        }));

        toast.success('Wallet name updated', {
          description: 'The wallet name has been updated successfully',
        });
      } else {
        throw new Error('Failed to update wallet name');
      }
    } catch (error) {
      console.error('Error updating wallet name:', error);
      toast.error('Update Failed', {
        description: error instanceof Error ? error.message : 'Failed to update wallet name',
      });
    } finally {
      setIsUpdatingName(false);
      setEditingWalletId(null);
      setEditingWalletName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingWalletId(null);
    setEditingWalletName('');
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <div>
            <Image src="/avian_spinner.png" alt="Loading..." width={48} height={48} unoptimized />
          </div>
          <span className="ml-2 text-muted-foreground">Loading wallets...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <WalletErrorBoundary
      name="WalletManager"
      isolate={true}
      onError={(error, errorInfo) => {
        toast.error('Wallet Manager Error', {
          description: 'The wallet manager encountered an error. Please try refreshing the page.',
        });
      }}
    >
      <div className="w-full">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {wallets.length} wallet{wallets.length !== 1 ? 's' : ''} total
          </div>
        </div>

        {/* Wallet Actions */}
        <Tabs defaultValue="wallets" className="mt-4 mb-6 flex">
          <TabsList className="w-full h-auto rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="wallets"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              My Wallets
            </TabsTrigger>
            <TabsTrigger
              value="create"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Create Wallet
            </TabsTrigger>
            <TabsTrigger
              value="import"
              className="flex-1 data-[state=active]:after:bg-primary relative rounded-none py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Import Wallet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallets" className="mt-4">
            {wallets.length > 0 ? (
              <div className="space-y-3">
                {wallets.map((wallet) => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    isActive={wallet.id === activeWallet?.id}
                    onSwitch={() => handleSwitchWallet(wallet.id!)}
                    onDelete={() => handleDeleteWallet(wallet.id!)}
                    onCopy={(address) => handleCopyAddress(address)}
                    isCopied={copiedAddress === wallet.address}
                    canDelete={wallets.length > 1}
                    editingWalletId={editingWalletId}
                    editingWalletName={editingWalletName}
                    isUpdatingName={isUpdatingName}
                    onEditName={handleEditName}
                    onSaveName={handleSaveName}
                    onCancelEdit={handleCancelEdit}
                    onEditingNameChange={setEditingWalletName}
                  />
                ))}
              </div>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No wallets found</AlertTitle>
                <AlertDescription>
                  Create a new wallet or import an existing one to get started.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <WalletCreationForm
              mode="create"
              onSubmit={async (data) => {
                try {
                  setIsCreating(true);

                  // Use WalletService to create a proper wallet with real keys
                  const { WalletService } = await import('@/services/wallet/WalletService');
                  const walletService = new WalletService();

                  const newWallet = await walletService.createNewWallet({
                    name: data.name,
                    password: data.password,
                    useMnemonic: true,
                    passphrase: data.passphrase, // Pass the optional BIP39 passphrase
                    mnemonicLength: data.mnemonicLength === '24' ? 256 : 128, // Convert to entropy bits
                    makeActive: true,
                  });

                  await loadWallets();
                  await reloadActiveWallet();

                  if (onWalletSelect) {
                    onWalletSelect(newWallet);
                  }

                  toast.success('Wallet created successfully', {
                    description: `${data.name} has been created and is now active.`,
                  });
                } catch (error) {
                  toast.error('Failed to create wallet', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                  });
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={() => { }}
              isSubmitting={isCreating}
            />
          </TabsContent>

          <TabsContent value="import" className="mt-4">
            <Tabs defaultValue="private-key" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="private-key">Private Key</TabsTrigger>
                <TabsTrigger value="mnemonic">Recovery Phrase</TabsTrigger>
                <TabsTrigger value="descriptor">Descriptor</TabsTrigger>
              </TabsList>

              <TabsContent value="private-key">
                <WalletCreationForm
                  mode="importWIF"
                  onSubmit={async (data) => {
                    try {
                      setIsCreating(true);

                      // Use WalletService to import wallet from private key
                      const { WalletService } = await import('@/services/wallet/WalletService');
                      const walletService = new WalletService();

                      const newWallet = await walletService.importWalletFromPrivateKey({
                        name: data.name,
                        privateKey: data.privateKey!,
                        password: data.password,
                        makeActive: true,
                      });

                      await loadWallets();
                      await reloadActiveWallet();

                      if (onWalletSelect) {
                        onWalletSelect(newWallet);
                      }

                      toast.success('Wallet imported successfully', {
                        description: `${data.name} has been imported and is now active.`,
                      });
                    } catch (error) {
                      toast.error('Failed to import wallet', {
                        description: error instanceof Error ? error.message : 'Unknown error',
                      });
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                  onCancel={() => { }}
                  isSubmitting={isCreating}
                />
              </TabsContent>

              <TabsContent value="mnemonic">
                <WalletCreationForm
                  mode="importMnemonic"
                  onSubmit={async (data) => {
                    try {
                      setIsCreating(true);

                      // Use WalletService to import wallet from mnemonic
                      const { WalletService } = await import('@/services/wallet/WalletService');
                      const walletService = new WalletService();

                      // Use WalletService with BIP39 passphrase support
                      const newWallet = await walletService.importWalletFromMnemonic({
                        name: data.name,
                        mnemonic: data.mnemonic!,
                        password: data.password,
                        passphrase: data.passphrase, // Pass the optional BIP39 passphrase
                        coinType: data.coinType, // Pass coin type for legacy compatibility
                        makeActive: true,
                      });

                      await loadWallets();
                      await reloadActiveWallet();

                      if (onWalletSelect) {
                        onWalletSelect(newWallet);
                      }

                      toast.success('Wallet recovered successfully', {
                        description: `${data.name} has been imported and is now active.`,
                      });
                    } catch (error) {
                      toast.error('Failed to recover wallet', {
                        description: error instanceof Error ? error.message : 'Unknown error',
                      });
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                  onCancel={() => { }}
                  isSubmitting={isCreating}
                />
              </TabsContent>

              <TabsContent value="descriptor">
                <WalletCreationForm
                  mode="importDescriptor"
                  onSubmit={async (data) => {
                    try {
                      setIsCreating(true);
                      const { WalletService } = await import('@/services/wallet/WalletService');
                      const walletService = new WalletService();

                      const newWallet = await walletService.importWalletFromDescriptor({
                        name: data.name,
                        descriptor: data.descriptor!,
                        password: data.password,
                        makeActive: true,
                      });

                      await loadWallets();
                      await reloadActiveWallet();

                      if (onWalletSelect) {
                        onWalletSelect(newWallet);
                      }

                      toast.success('Descriptor wallet imported', {
                        description: `${data.name} has been imported and is now active.`,
                      });
                    } catch (error) {
                      toast.error('Failed to import descriptor wallet', {
                        description: error instanceof Error ? error.message : 'Unknown error',
                      });
                    } finally {
                      setIsCreating(false);
                    }
                  }}
                  onCancel={() => { }}
                  isSubmitting={isCreating}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {showCreateForm && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Create New Wallet
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                placeholder="Wallet name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3 text-sm">
                    <p className="text-blue-800 dark:text-blue-200 font-medium">
                      Security Requirement
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      All wallets must be password protected for your security. Choose a strong
                      password you&apos;ll remember.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showNewWalletPassword ? "text" : "password"}
                  value={newWalletPassword}
                  onChange={(e) => setNewWalletPassword(e.target.value)}
                  placeholder="Enter wallet password (required)"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowNewWalletPassword(!showNewWalletPassword)}
                >
                  {showNewWalletPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewWalletPasswordConfirm ? "text" : "password"}
                  value={newWalletPasswordConfirm}
                  onChange={(e) => setNewWalletPasswordConfirm(e.target.value)}
                  placeholder="Confirm wallet password"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowNewWalletPasswordConfirm(!showNewWalletPasswordConfirm)}
                >
                  {showNewWalletPasswordConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-200">{passwordError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCreateWallet}
                  disabled={
                    isCreating ||
                    !newWalletName.trim() ||
                    !newWalletPassword ||
                    !newWalletPasswordConfirm
                  }
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Wallet'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewWalletName('');
                    setNewWalletPassword('');
                    setNewWalletPasswordConfirm('');
                    setPasswordError('');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Private Key Form */}
        {showImportKeyForm && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Import Private Key
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={importWalletName}
                onChange={(e) => setImportWalletName(e.target.value)}
                placeholder="Wallet name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <textarea
                value={importPrivateKey}
                onChange={(e) => setImportPrivateKey(e.target.value)}
                placeholder="Enter your private key (WIF format)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-20 resize-none"
              />

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3 text-sm">
                    <p className="text-amber-800 dark:text-amber-200 font-medium">
                      Security Required
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 mt-1">
                      Your imported wallet will be encrypted with a password for security.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showImportWalletPassword ? "text" : "password"}
                  value={importWalletPassword}
                  onChange={(e) => setImportWalletPassword(e.target.value)}
                  placeholder="Create wallet password (required)"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowImportWalletPassword(!showImportWalletPassword)}
                >
                  {showImportWalletPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showImportWalletPasswordConfirm ? "text" : "password"}
                  value={importWalletPasswordConfirm}
                  onChange={(e) => setImportWalletPasswordConfirm(e.target.value)}
                  placeholder="Confirm wallet password"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowImportWalletPasswordConfirm(!showImportWalletPasswordConfirm)}
                >
                  {showImportWalletPasswordConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-200">{passwordError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleImportPrivateKey}
                  disabled={
                    isCreating ||
                    !importWalletName.trim() ||
                    !importPrivateKey.trim() ||
                    !importWalletPassword ||
                    !importWalletPasswordConfirm
                  }
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Importing...' : 'Import Wallet'}
                </button>
                <button
                  onClick={() => {
                    setShowImportKeyForm(false);
                    setImportWalletName('');
                    setImportWalletPassword('');
                    setImportWalletPasswordConfirm('');
                    setImportPrivateKey('');
                    setPasswordError('');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Mnemonic Form */}
        {showImportMnemonicForm && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Import Recovery Phrase
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={importWalletName}
                onChange={(e) => setImportWalletName(e.target.value)}
                placeholder="Wallet name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <textarea
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                placeholder="Enter your 12-word mnemonic phrase (separated by spaces)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-20 resize-none"
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  BIP39 Passphrase (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showImportMnemonicPassphrase ? "text" : "password"}
                    value={importMnemonicPassphrase}
                    onChange={(e) => setImportMnemonicPassphrase(e.target.value)}
                    placeholder="Enter optional BIP39 passphrase"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => setShowImportMnemonicPassphrase(!showImportMnemonicPassphrase)}
                  >
                    {showImportMnemonicPassphrase ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Also known as the &quot;25th word&quot; - only enter if you used one when creating
                  the wallet
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3 text-sm">
                    <p className="text-green-800 dark:text-green-200 font-medium">
                      Secure Recovery
                    </p>
                    <p className="text-green-700 dark:text-green-300 mt-1">
                      Your recovered wallet will be encrypted with a password for enhanced security.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showImportWalletPassword ? "text" : "password"}
                  value={importWalletPassword}
                  onChange={(e) => setImportWalletPassword(e.target.value)}
                  placeholder="Create wallet password (required)"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowImportWalletPassword(!showImportWalletPassword)}
                >
                  {showImportWalletPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showImportWalletPasswordConfirm ? "text" : "password"}
                  value={importWalletPasswordConfirm}
                  onChange={(e) => setImportWalletPasswordConfirm(e.target.value)}
                  placeholder="Confirm wallet password"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setShowImportWalletPasswordConfirm(!showImportWalletPasswordConfirm)}
                >
                  {showImportWalletPasswordConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {passwordError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-200">{passwordError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleImportMnemonic}
                  disabled={
                    isCreating ||
                    !importWalletName.trim() ||
                    !importMnemonic.trim() ||
                    !importWalletPassword ||
                    !importWalletPasswordConfirm
                  }
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? 'Importing...' : 'Import Wallet'}
                </button>
                <button
                  onClick={() => {
                    setShowImportMnemonicForm(false);
                    setImportWalletName('');
                    setImportWalletPassword('');
                    setImportWalletPasswordConfirm('');
                    setImportMnemonic('');
                    setImportMnemonicPassphrase('');
                    setPasswordError('');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Wallet Confirmation Dialog - Responsive */}
        {isMobile ? (
          <Drawer open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DrawerContent
              role="dialog"
              aria-labelledby="delete-wallet-title"
              aria-describedby="delete-wallet-description"
            >
              <DrawerHeader className="text-center">
                <DrawerTitle id="delete-wallet-title">Delete Wallet</DrawerTitle>
                <DrawerDescription id="delete-wallet-description">
                  Are you sure you want to delete this wallet? This action cannot be undone.
                  <br />
                  <span className="font-medium text-red-500">
                    All funds in this wallet will be lost if you haven&apos;t backed up your private
                    key or recovery phrase.
                  </span>
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter className="gap-2">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={confirmDeleteWallet}
                  autoFocus
                >
                  Delete Wallet
                </Button>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                  Cancel
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent className="dark:bg-gray-800 border dark:border-gray-700">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this wallet? This action cannot be undone.
                  <br />
                  <span className="font-medium text-red-500">
                    All funds in this wallet will be lost if you haven&apos;t backed up your private
                    key or recovery phrase.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={confirmDeleteWallet}
                >
                  Delete Wallet
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {wallets.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No wallets found. Create your first wallet to get started.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create First Wallet
            </button>
          </div>
        )}
      </div>
    </WalletErrorBoundary>
  );
}
