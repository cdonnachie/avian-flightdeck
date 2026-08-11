'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, RefreshCw, Key, AlertTriangle, X } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';

// Shadcn UI components
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';

interface MnemonicModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'export' | 'import';
}

export default function MnemonicModal({ isOpen, onClose, mode }: MnemonicModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const {
    exportMnemonic,
    restoreWalletFromMnemonic,
    validateMnemonic,
    generateWallet,
    isEncrypted,
  } = useWallet();

  const { requireAuth } = useSecurity();

  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidMnemonic, setIsValidMnemonic] = useState<boolean | null>(null);
  const [hasBip39Passphrase, setHasBip39Passphrase] = useState(false);
  const [showPassphraseOption, setShowPassphraseOption] = useState(false);
  const [decryptedPassphrase, setDecryptedPassphrase] = useState('');
  const [isLoadingPassphrase, setIsLoadingPassphrase] = useState(false);

  const resetForm = () => {
    setMnemonic('');
    setImportMnemonic('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowMnemonic(false);
    setError('');
    setIsValidMnemonic(null);
    setHasBip39Passphrase(false);
    setShowPassphraseOption(false);
    setDecryptedPassphrase('');
    setIsLoadingPassphrase(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Export mnemonic functionality
  const handleExportMnemonic = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Use the requireAuth function from SecurityContext
      const authResult = await requireAuth('Please authenticate to view mnemonic phrase');

      if (!authResult.success || !authResult.password) {
        // Authentication was canceled or failed in the dialog
        toast.error('Authentication failed', {
          description: 'You must authenticate to view the mnemonic phrase',
        });
        setIsLoading(false);
        return;
      }

      // Check if wallet has BIP39 passphrase before exporting mnemonic
      try {
        const { StorageService } = await import('@/services/core/StorageService');
        const activeWallet = await StorageService.getActiveWallet();
        setHasBip39Passphrase(!!activeWallet?.bip39Passphrase);
      } catch (err) {
        // If we can't check, assume no passphrase
        setHasBip39Passphrase(false);
      }

      // Use the password provided from the authentication
      const exportedMnemonic = await exportMnemonic(isEncrypted ? authResult.password : undefined);

      if (!exportedMnemonic) {
        setError('No mnemonic found. This wallet was created without BIP39 support.');
        return;
      }

      setMnemonic(exportedMnemonic);
      toast.success('Mnemonic exported', {
        description: 'Your mnemonic phrase has been successfully exported',
      });
    } catch (error: any) {
      setError(error.message || 'Failed to export mnemonic');
    } finally {
      setIsLoading(false);
    }
  };

  // Export BIP39 passphrase functionality
  const handleExportPassphrase = async () => {
    try {
      setIsLoadingPassphrase(true);
      setError('');

      // Require separate authentication for passphrase access
      const authResult = await requireAuth(
        'Please authenticate to view your BIP39 passphrase (25th word)',
      );

      if (!authResult.success || !authResult.password) {
        toast.error('Authentication failed', {
          description: 'You must authenticate to view the BIP39 passphrase',
        });
        setIsLoadingPassphrase(false);
        return;
      }

      // Get and decrypt the passphrase
      const { StorageService } = await import('@/services/core/StorageService');
      const activeWallet = await StorageService.getActiveWallet();

      if (!activeWallet?.bip39Passphrase) {
        setError('No BIP39 passphrase found for this wallet');
        return;
      }

      // Decrypt the passphrase
      const { decryptData } = await import('@/services/wallet/WalletService');
      const result = await decryptData(activeWallet.bip39Passphrase, authResult.password);
      const decrypted = result.decrypted;

      setDecryptedPassphrase(decrypted);
      setShowPassphraseOption(true);

      toast.success('Passphrase decrypted', {
        description: 'Your BIP39 passphrase has been decrypted and is now visible',
      });
    } catch (error: any) {
      setError(error.message || 'Failed to decrypt BIP39 passphrase');
    } finally {
      setIsLoadingPassphrase(false);
    }
  };

  // Import mnemonic functionality
  const handleValidateMnemonic = async (mnemonicToValidate: string) => {
    if (!mnemonicToValidate.trim()) {
      setIsValidMnemonic(null);
      return;
    }

    try {
      const valid = await validateMnemonic(mnemonicToValidate.trim());
      setIsValidMnemonic(valid);
      if (!valid) {
        setError('Invalid BIP39 mnemonic phrase');
      } else {
        setError('');
      }
    } catch (error) {
      setIsValidMnemonic(false);
      setError('Error validating mnemonic');
    }
  };

  const handleImportMnemonic = async () => {
    if (!importMnemonic.trim()) {
      setError('Please enter a mnemonic phrase');
      return;
    }

    if (isValidMnemonic === false) {
      setError('Please enter a valid BIP39 mnemonic phrase');
      return;
    }

    // Password is now mandatory
    if (!newPassword || newPassword.length < 8) {
      setError('Password is required and must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await restoreWalletFromMnemonic('Imported Wallet', importMnemonic.trim(), newPassword);
      toast.success('Wallet imported', {
        description: 'Your wallet has been successfully restored from the mnemonic phrase',
      });

      // Close modal and reload page after short delay
      setTimeout(() => {
        handleClose();
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to restore wallet from mnemonic');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNewWallet = async () => {
    // Password is now mandatory
    if (!newPassword || newPassword.length < 8) {
      setError('Password is required and must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await generateWallet(newPassword, true);
      toast.success('New wallet created', {
        description: 'A new wallet with mnemonic phrase has been generated',
      });

      // Close modal and reload page after short delay
      setTimeout(() => {
        handleClose();
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to generate new wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: string = 'Mnemonic phrase') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard', {
        description: `${type} copied successfully`,
      });
    } catch (error) {
      setError('Failed to copy to clipboard');
    }
  };

  // Render based on device size
  if (!isOpen) return null;

  const title = `${mode === 'export' ? 'Export' : 'Import'} Mnemonic Phrase`;

  // The content to be shown in both dialog and drawer
  const content = (
    <div className="space-y-4">
      {mode === 'export' ? (
        // Export Mode
        <div className="space-y-4">
          <Alert className="bg-caution/10 border-caution/30">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Security Warning</AlertTitle>
            <AlertDescription>
              Your mnemonic phrase provides complete access to your wallet. Never share it with
              anyone and store it securely offline.
            </AlertDescription>
          </Alert>

          {/* Authentication dialog is used instead of inline password field */}

          {!mnemonic ? (
            <Button
              onClick={handleExportMnemonic}
              disabled={isLoading}
              className="w-full bg-avian-orange hover:bg-avian-orange/90"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Export Mnemonic
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="block text-sm font-medium">
                    Your Mnemonic Phrase ({mnemonic.split(' ').length} words)
                  </span>
                  <Button
                    onClick={() => setShowMnemonic(!showMnemonic)}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-sm"
                  >
                    {showMnemonic ? (
                      <>
                        <EyeOff className="w-4 h-4 mr-1" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-1" />
                        Show
                      </>
                    )}
                  </Button>
                </div>

                {/* Mnemonic Grid Display */}
                <div
                  className={`grid ${mnemonic.split(' ').length <= 12 ? 'grid-cols-3' : 'grid-cols-4'} gap-3 ${showMnemonic ? '' : 'filter blur-sm'}`}
                >
                  {mnemonic.split(' ').map((word, index) => (
                    <div key={index} className="bg-muted/50 border rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">{index + 1}</div>
                      <div className="font-mono text-sm font-medium">{word}</div>
                    </div>
                  ))}
                </div>

                {/* BIP39 Passphrase Indicator */}
                {hasBip39Passphrase && (
                  <Alert className="bg-primary/5 border-primary/20">
                    <Key className="h-4 w-4" />
                    <AlertTitle>BIP39 Passphrase (25th Word) Required</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>
                        This wallet uses an additional BIP39 passphrase (25th word). You will need
                        both the mnemonic phrase above AND the passphrase to fully restore this
                        wallet.
                      </p>
                      <p className="font-medium text-foreground">
                        ⚠️ Make sure you have backed up your passphrase separately!
                      </p>

                      {!showPassphraseOption ? (
                        <div className="pt-2">
                          <Button
                            onClick={handleExportPassphrase}
                            disabled={isLoadingPassphrase}
                            variant="outline"
                            size="sm"
                            className="text-primary border-primary/40 hover:bg-primary/10"
                          >
                            {isLoadingPassphrase ? (
                              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
                            ) : (
                              <Eye className="w-3 h-3 mr-2" />
                            )}
                            Show My Passphrase
                          </Button>
                        </div>
                      ) : (
                        <div className="pt-2 space-y-3">
                          <div className="bg-caution/10 border border-caution/30 rounded-md p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-caution">
                                Your BIP39 Passphrase:
                              </span>
                              <Button
                                onClick={() =>
                                  copyToClipboard(decryptedPassphrase, 'BIP39 passphrase')
                                }
                                variant="ghost"
                                size="sm"
                                className="h-6 text-caution hover:text-caution"
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="font-mono text-sm bg-background p-2 rounded border break-all">
                              {decryptedPassphrase}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            🔒 Store this passphrase separately from your mnemonic for maximum
                            security.
                          </p>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {showMnemonic && (
                <Button
                  onClick={() => copyToClipboard(mnemonic, 'Mnemonic phrase')}
                  variant="secondary"
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy to Clipboard
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        // Import Mode
        <div className="space-y-4">
          <Alert className="bg-primary/5 border-primary/20">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Import Wallet</AlertTitle>
            <AlertDescription>
              Enter your 12-word BIP39 mnemonic phrase to restore your wallet. This will replace any
              existing wallet.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Mnemonic Phrase</label>
            <Textarea
              value={importMnemonic}
              onChange={(e) => {
                setImportMnemonic(e.target.value);
                handleValidateMnemonic(e.target.value);
              }}
              placeholder="Enter your 12-word mnemonic phrase..."
              className={`${isValidMnemonic === false
                  ? 'border-destructive/50'
                  : isValidMnemonic === true
                    ? 'border-primary/50'
                    : ''
                }`}
              rows={3}
            />
            {isValidMnemonic === true && (
              <p className="text-sm text-primary">✓ Valid mnemonic phrase</p>
            )}
            {isValidMnemonic === false && (
              <p className="text-sm text-destructive">✗ Invalid mnemonic phrase</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Password (Required for Security)</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password to encrypt wallet (min 8 characters)"
                required
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Confirm Password</label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleImportMnemonic}
              disabled={isLoading || !importMnemonic.trim() || isValidMnemonic === false}
              className="flex-1 bg-avian-orange hover:bg-avian-orange/90"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Import Wallet
            </Button>

            <Button
              onClick={handleGenerateNewWallet}
              disabled={isLoading}
              className="flex-1"
              variant="secondary"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Generate New
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  // Use drawer on mobile and dialog on desktop
  return isDesktop ? (
    <Dialog open={isOpen} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-avian-orange" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open={isOpen} onOpenChange={() => handleClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-avian-orange" />
            {title}
          </DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="px-4 pb-4 overflow-y-auto flex-1">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
