'use client';

import React, { useState, useEffect, useRef } from 'react';
import { securityService } from '@/services/core/SecurityService';
import { StorageService } from '@/services/core/StorageService';
// WalletService is loaded lazily in the submit handler below. Importing it statically would pull
// the ~1.7 MB secp256k1 build into the initial bundle, and this dialog is mounted app-wide by
// SecurityProvider.
import { Fingerprint, Lock, X, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMediaQuery } from '@/hooks/use-media-query';

interface AuthenticationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (password: string) => void;
  title?: string;
  message?: string;
  walletAddress?: string; // Wallet address to check for biometric setup
}

export default function AuthenticationDialog({
  isOpen,
  onClose,
  onAuthenticate,
  title = 'Authentication Required',
  message = 'Please authenticate to continue',
  walletAddress,
}: AuthenticationDialogProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    if (isOpen) {
      // Clear previous state
      setPassword('');
      setShowPassword(false);
      setError(null);
      setIsAuthenticating(false);

      // Check if biometric auth is available for this wallet
      const checkBiometricAvailability = async () => {
        try {
          // First check if biometrics are available on the device
          const deviceBiometricsAvailable = await securityService.isBiometricAuthAvailable();

          // We need a wallet address to check for biometric setup
          if (!walletAddress) {
            setBiometricAvailable(false);
            return;
          }

          // Then check if biometrics are enabled for this specific wallet
          let walletBiometricsEnabled = false;
          if (deviceBiometricsAvailable) {
            walletBiometricsEnabled =
              await StorageService.isBiometricEnabledForWallet(walletAddress);
          }

          // Also check if there's an actual credential stored
          const storedCredentialId = await StorageService.getBiometricCredential(walletAddress);
          const hasCredential = !!storedCredentialId && storedCredentialId.length > 0;

          // Biometrics are available if: 1) Device supports it AND 2) Biometrics is enabled for the wallet AND 3) There's a stored credential
          const biometricAvailable =
            deviceBiometricsAvailable && walletBiometricsEnabled && hasCredential;

          setBiometricAvailable(biometricAvailable);

          // Try biometric auth immediately if available
          if (biometricAvailable) {
            handleBiometricAuth();
          } else {
            // Focus password input after the dialog has rendered
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
              } else {
              }
            }, 300);
          }
        } catch (error) {
          setBiometricAvailable(false);

          // Focus password input
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 300);
        }
      };

      checkBiometricAvailability();
    }
    // We intentionally exclude handleBiometricAuth from deps to avoid an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, walletAddress]);

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Additional check to make sure we have a wallet address and biometrics are properly set up
      if (!walletAddress) {
        throw new Error('No wallet address provided for biometric authentication');
      }

      // Verify that biometrics are enabled for this wallet
      const walletBiometricsEnabled =
        await StorageService.isBiometricEnabledForWallet(walletAddress);
      if (!walletBiometricsEnabled) {
        throw new Error('Biometrics are not set up for this wallet');
      }

      // Check if this is the active wallet
      const activeWallet = await StorageService.getActiveWallet();
      if (!activeWallet || activeWallet.address !== walletAddress) {
        throw new Error('Biometric authentication is only available for the active wallet');
      }

      const result = await securityService.authenticateWithBiometric();
      if (result.success && result.walletPassword) {
        onAuthenticate(result.walletPassword);
      } else {
        setError('Biometric authentication failed. Please try again or enter your password.');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    } catch (err) {
      // More specific error messages based on the type of error
      let errorMessage = 'Could not authenticate with biometrics. Please enter your password.';

      if (err instanceof Error) {
        const errorStr = err.toString().toLowerCase();
        if (errorStr.includes('passkeys') || errorStr.includes('no credential')) {
          errorMessage = 'No passkeys available for this wallet. Please use your password.';
        } else if (errorStr.includes('not supported') || errorStr.includes('not available')) {
          errorMessage = 'Biometric authentication is not supported on this device.';
        } else if (errorStr.includes('timeout')) {
          errorMessage =
            'Biometric authentication timed out. Please try again or use your password.';
        } else if (errorStr.includes('user canceled') || errorStr.includes('aborted')) {
          errorMessage = 'Biometric authentication was canceled.';
        }
      }

      setError(errorMessage);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsAuthenticating(true);
    setError(null);

    try {
      // Verify the password against the wallet
      const { WalletService } = await import('@/services/wallet/WalletService');
      const walletService = new WalletService();

      const isValid = await walletService.validateWalletPassword(password);

      if (isValid) {
        // Password is correct
        onAuthenticate(password);
      } else {
        // Password is incorrect
        setError('Incorrect password. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <>
      {isMobile ? (
        <Drawer
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <DrawerContent className="max-h-[95vh]">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-xl font-semibold flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                {title}
              </DrawerTitle>
            </DrawerHeader>

            <div className="px-4 pb-4 space-y-4">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                  {error}
                </div>
              )}

              <p className="text-muted-foreground">{message}</p>

              <form onSubmit={handlePasswordSubmit}>
                <div className="space-y-2 mb-4">
                  <Label htmlFor="password">Wallet Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      ref={inputRef}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your wallet password"
                      autoFocus
                      autoComplete="current-password"
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

                <div className="flex flex-col gap-3 mt-6">
                  {biometricAvailable && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBiometricAuth}
                      disabled={isAuthenticating}
                      className="w-full gap-2"
                    >
                      <Fingerprint className="h-4 w-4" />
                      Use Biometrics
                    </Button>
                  )}

                  <Button
                    type="submit"
                    disabled={password.trim() === '' || isAuthenticating}
                    variant="default"
                    className="w-full gap-2"
                  >
                    {isAuthenticating ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
                  {error}
                </div>
              )}

              <p className="text-muted-foreground">{message}</p>

              <form onSubmit={handlePasswordSubmit}>
                <div className="space-y-2 mb-4">
                  <Label htmlFor="password">Wallet Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      ref={inputRef}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your wallet password"
                      autoFocus
                      autoComplete="current-password"
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

                <div className="flex items-center justify-between mt-6">
                  {biometricAvailable && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBiometricAuth}
                      disabled={isAuthenticating}
                      className="gap-2"
                    >
                      <Fingerprint className="h-4 w-4" />
                      Use Biometrics
                    </Button>
                  )}

                  <Button
                    type="submit"
                    disabled={password.trim() === '' || isAuthenticating}
                    variant="default"
                    className={`${biometricAvailable ? 'ml-auto' : ''} gap-2`}
                  >
                    {isAuthenticating ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Unlock
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
