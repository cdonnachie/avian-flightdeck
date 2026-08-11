'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, Eye, EyeOff, Shield, Clock, Wallet } from 'lucide-react';
import { securityService } from '@/services/core/SecurityService';
import { StorageService } from '@/services/core/StorageService';
import { toast } from 'sonner';
import GradientBackground from '@/components/GradientBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import BiometricSetupButton from '@/components/BiometricSetupButton';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SecurityLockScreenProps {
  onUnlock: () => void;
  lockReason?: 'timeout' | 'manual' | 'failed_auth';
}

interface ActiveWalletInfo {
  name: string;
  address: string;
  isEncrypted: boolean;
}

export default function SecurityLockScreen({ onUnlock, lockReason }: SecurityLockScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricSetup, setBiometricSetup] = useState(false);
  const [activeWallet, setActiveWallet] = useState<ActiveWalletInfo | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState(0);
  const [hasWallets, setHasWallets] = useState(true); // Default to true to avoid flashing unlock screen

  const checkLockoutStatus = useCallback(() => {
    const lockedOut = securityService.isLockedOut();
    const timeRemaining = securityService.getRemainingLockoutTime();

    setIsLockedOut(lockedOut);
    setLockoutTimeRemaining(timeRemaining);

    if (lockedOut) {
      setError(
        `Too many failed attempts. Please wait ${Math.ceil(timeRemaining / 1000)} seconds before trying again.`,
      );
    } else if (error.includes('Too many failed attempts')) {
      setError('');
    }
  }, [error]);

  useEffect(() => {
    const init = async () => {
      // Check if there are any wallets
      const wallets = await StorageService.getAllWallets();
      setHasWallets(wallets.length > 0);

      // If no wallets exist, unlock immediately
      if (wallets.length === 0) {
        onUnlock();
        return;
      }

      // If lock reason is timeout, check if requirePasswordAfterTimeout is disabled
      if (lockReason === 'timeout') {
        const securitySettings = await securityService.getSecuritySettings();
        if (!securitySettings.autoLock.requirePasswordAfterTimeout) {
          // Auto-unlock if requirePasswordAfterTimeout is disabled

          toast.info('Auto-Unlock', {
            description:
              'Your wallet was auto-unlocked after timeout (password not required per your settings)',
          });
          onUnlock();
          return;
        }
      }

      await loadActiveWalletInfo();
      await checkBiometricSupport();
      checkLockoutStatus();
    };

    init();

    // Update lockout timer every second if locked out
    const lockoutInterval = setInterval(() => {
      if (isLockedOut) {
        checkLockoutStatus();
      }
    }, 1000);

    return () => clearInterval(lockoutInterval);
  }, [isLockedOut, checkLockoutStatus, onUnlock, lockReason]);

  // Re-check biometric support when activeWallet changes
  useEffect(() => {
    if (activeWallet) {
      checkBiometricSupport();
    }
  }, [activeWallet]);

  // Listen for security settings changes
  useEffect(() => {
    const handleSecuritySettingsChange = () => {
      checkBiometricSupport();
    };

    // Add event listener for security settings changes
    window.addEventListener('security-settings-changed', handleSecuritySettingsChange);

    return () => {
      window.removeEventListener('security-settings-changed', handleSecuritySettingsChange);
    };
  }, []);

  const loadActiveWalletInfo = async () => {
    try {
      const wallet = await StorageService.getActiveWallet();
      if (wallet) {
        setActiveWallet({
          name: wallet.name,
          address: wallet.address,
          isEncrypted: wallet.isEncrypted,
        });
      }
    } catch (error) {
      toast.error('Failed to load active wallet', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const checkBiometricSupport = async () => {
    try {
      // First check if biometrics are available and enabled globally
      const biometricAuthAvailable = await StorageService.isBiometricEnabled();

      if (!biometricAuthAvailable) {
        // If biometrics are not available or globally disabled, don't show any biometric options
        setBiometricSupported(false);
        setBiometricSetup(false);
        setBiometricAvailable(false);
        return;
      }

      // If biometrics are available, get detailed capabilities
      const capabilities = await securityService.getBiometricCapabilities();

      setBiometricSupported(capabilities.isSupported);

      // Get active wallet to check if biometrics are set up for it specifically
      const wallet = await StorageService.getActiveWallet();
      if (!wallet) {
        setBiometricAvailable(false);
        return;
      }

      // Use the new wallet-specific biometric check method
      let walletBiometricEnabled = await securityService.isWalletBiometricEnabled(wallet.address);

      // Legacy credential check - can be removed once transition is complete
      const legacyCredential = await StorageService.getBiometricCredential(wallet.address);

      // Auto-fix: If wallet doesn't have proper biometrics but has legacy credentials, fix it
      if (!walletBiometricEnabled && !!legacyCredential) {
        await StorageService.saveWalletWithBiometricData(wallet, legacyCredential);

        // Re-check after fixing
        const isFixedNow = await securityService.isWalletBiometricEnabled(wallet.address);
        if (isFixedNow) {
          // Update UI state to reflect the fix
          walletBiometricEnabled = isFixedNow;
        }
      }

      // Final biometric availability check
      const biometricsAvailable = capabilities.isSupported && walletBiometricEnabled;

      // Set the biometrics state based on wallet-specific data
      setBiometricAvailable(biometricsAvailable);
      setBiometricSetup(walletBiometricEnabled);
    } catch (error) {
      setBiometricSupported(false);
      setBiometricAvailable(false);
    }
  };

  const handlePasswordUnlock = async () => {
    // Check if currently locked out
    if (isLockedOut) {
      setError(
        `Too many failed attempts. Please wait ${Math.ceil(lockoutTimeRemaining / 1000)} seconds before trying again.`,
      );
      return;
    }

    // If wallet doesn't require a password, unlock immediately
    if (!activeWallet?.isEncrypted) {
      handleUnlockSuccess('No password required for this wallet');
      return;
    }

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await securityService.unlockWallet(password, false);
      if (success) {
        handleUnlockSuccess('Welcome back!');
      } else {
        setError('Invalid password');
        // Check lockout status after failed attempt
        checkLockoutStatus();
      }
    } catch (error: any) {
      // Handle lockout error specifically
      if (error.message && error.message.includes('Too many failed attempts')) {
        setError(error.message);
        checkLockoutStatus();
      } else {
        toast.error('Failed to unlock wallet', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        setError('Failed to unlock wallet');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlockSuccess = (message: string) => {
    toast.success('Wallet unlocked', {
      description: message,
    });
    onUnlock();
  };

  const handleBiometricUnlock = async () => {
    if (!biometricAvailable) return;

    // Check if currently locked out
    if (isLockedOut) {
      setError(
        `Too many failed attempts. Please wait ${Math.ceil(lockoutTimeRemaining / 1000)} seconds before trying again.`,
      );
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Debug wallet information
      const wallet = await StorageService.getActiveWallet();

      // With biometric authentication, the password is retrieved from secure storage
      // The second parameter 'true' indicates to use biometric authentication

      const success = await securityService.unlockWallet(undefined, true);

      if (success) {
        handleUnlockSuccess('Biometric authentication successful');
      } else {
        toast.error('Biometric authentication failed', {
          description: 'Please try again.',
        });
        setError('Biometric authentication failed');
        // Check lockout status after failed attempt
        checkLockoutStatus();
      }
    } catch (error: any) {
      // Handle lockout error specifically
      if (error.message && error.message.includes('Too many failed attempts')) {
        setError(error.message);
        checkLockoutStatus();
      } else {
        setError(`Biometric authentication failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricSetup = async () => {
    if (!biometricSupported) {
      toast.error('Biometric Setup Failed', {
        description: 'Biometric authentication is not supported on this device',
      });
      return;
    }

    // We need the password to associate with the biometric credential
    if (activeWallet?.isEncrypted && !password) {
      setError('Please enter your wallet password first to enable biometric authentication');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // First verify the password is correct before setting up biometrics
      if (activeWallet?.isEncrypted) {
        // Try validating the password first
        const passwordValid = await securityService.unlockWallet(password, false);
        if (!passwordValid) {
          setError(
            'Invalid password. Please enter the correct password before setting up biometrics.',
          );
          setIsLoading(false);
          return;
        }
      }

      // Setup biometric authentication with the wallet's password
      // After validating password, set up biometrics and store the wallet password
      const walletId = activeWallet ? activeWallet.address : undefined;
      const success = await securityService.setupBiometricAuth(walletId);

      // If successful and we have a password, store it securely
      if (success && activeWallet?.isEncrypted && password) {
        // Get the credential to use as encryption key
        const credential = await StorageService.getBiometricCredential();
        if (credential && activeWallet) {
          const secureKey = credential.join('-');
          await StorageService.setEncryptedWalletPassword(
            secureKey,
            password,
            activeWallet.address,
          );

          // Force refresh the biometric status
          await checkBiometricSupport();
        }
      }
      if (success) {
        // Enable biometric authentication
        await StorageService.setBiometricEnabled(true);

        // Update our state
        setBiometricSetup(true);
        setBiometricAvailable(true);

        toast.success('Biometric Setup Complete', {
          description: 'Biometric authentication is now enabled for your wallet',
        });

        // Clear password field for security
        setPassword('');

        // Log the security event
        await securityService.logSecurityEvent(
          'biometric_setup',
          'Biometric authentication enabled by user',
          true,
        );
      } else {
        setError('Failed to set up biometric authentication. Please try again.');
        toast.error('Biometric Setup Failed', {
          description:
            'Unable to set up biometric authentication. Please ensure your device supports it and try again.',
        });
      }
    } catch (error: any) {
      let errorMessage = 'Failed to set up biometric authentication';

      // Handle specific WebAuthn errors
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Biometric setup was cancelled or denied';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Biometric authentication is not supported on this device';
      } else if (error.name === 'InvalidStateError') {
        errorMessage =
          'Biometric authentication is not available. Please check your device settings.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Security error occurred during biometric setup';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      toast.error('Biometric Setup Failed', {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricDisable = async () => {
    if (!biometricSetup || !activeWallet) {
      return; // Nothing to disable
    }

    setIsLoading(true);
    setError('');

    try {
      // Only disable for the current wallet
      const success = await securityService.disableBiometricAuth(activeWallet.address);
      if (success) {
        // Update our state
        setBiometricSetup(false);
        setBiometricAvailable(false);

        // Get the biometric type for the success message
        const biometricTypeDisplay = getBiometricTypeDisplay();

        toast.success('Biometrics Disabled', {
          description: `Biometric authentication has been disabled for wallet "${activeWallet.name}"`,
        });
      } else {
        setError('Failed to disable biometric authentication');
        toast.error('Error', {
          description: 'Failed to disable biometric authentication',
        });
      }
    } catch (error: any) {
      setError('Failed to disable biometric authentication');
      toast.error('Error', {
        description: error.message || 'Failed to disable biometric authentication',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceEnableBiometrics = async () => {
    try {
      // Get the active wallet
      const wallet = await StorageService.getActiveWallet();
      if (!wallet) {
        setError('No active wallet found');
        return;
      }

      // Create a credential if none exists
      let credentialId = wallet.biometricCredentialId;
      if (!credentialId) {
        // Generate a dummy credential ID for testing
        credentialId = Array.from(crypto.getRandomValues(new Uint8Array(32)));

        // Store the credential
        await StorageService.setBiometricCredential(credentialId, wallet.address);
      }

      // Set a placeholder encrypted password if none exists
      if (!wallet.encryptedBiometricPassword && wallet.isEncrypted) {
        const secureKey = credentialId.join('-');

        await StorageService.setEncryptedWalletPassword(
          secureKey,
          'debug-placeholder-password',
          wallet.address,
        );
      }

      // Update the global biometric setting
      await StorageService.setBiometricEnabled(true);

      // Force a re-check of biometric support
      await checkBiometricSupport();

      setSuccess('Biometrics forcefully enabled for debugging');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to force enable biometrics');
    }
  };

  const getBiometricTypeDisplay = (): string => {
    // Use a generic term for all biometric authentication
    return 'Biometric';
  };

  const getBiometricIcon = () => {
    // Use a fingerprint as the generic biometric icon
    return <Fingerprint className="w-5 h-5 mr-2" />;
  };

  const getLockReasonMessage = () => {
    switch (lockReason) {
      case 'timeout':
        return 'Your wallet was locked due to inactivity';
      case 'failed_auth':
        return 'Your wallet was locked due to failed authentication attempts';
      case 'manual':
        return 'Your wallet is locked for security';
      default:
        return 'Your wallet is locked for security';
    }
  };

  const getLockReasonIcon = () => {
    switch (lockReason) {
      case 'timeout':
        return <Clock className="w-6 h-6 text-caution" />;
      case 'failed_auth':
        return <Shield className="w-6 h-6 text-destructive" />;
      default:
        return <Lock className="w-6 h-6 text-avian-600 dark:text-avian-400" />;
    }
  };

  // If no wallets exist, don't render the lock screen at all
  if (!hasWallets) {
    return null;
  }

  return (
    <GradientBackground>
      <div className="min-h-screen px-4 py-8 flex flex-col justify-center">
        <div className="w-full">
          <Card className="relative w-full max-w-lg mx-auto shadow-2xl">
            {/* Theme Toggle Button */}
            <div className="absolute top-4 right-4 z-10">
              <ThemeSwitcher />
            </div>

            {/* Header */}
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">{getLockReasonIcon()}</div>
              <CardTitle className="text-2xl">Wallet Locked</CardTitle>
              <CardDescription>{getLockReasonMessage()}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Active Wallet Info */}
              {activeWallet && (
                <Card className="mb-5 bg-muted/40 border border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center">
                      <Wallet className="w-4 h-4 mr-2 text-avian-600 dark:text-avian-400" />
                      <CardTitle className="text-sm font-medium text-foreground">
                        Active Wallet
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2 pt-0">
                    <div className="flex flex-wrap justify-between">
                      <span className="mr-2">Name:</span>
                      <span className="font-medium break-all">{activeWallet.name}</span>
                    </div>
                    <div className="flex flex-wrap justify-between">
                      <span className="mr-2">Address:</span>
                      <span className="font-mono text-xs truncate max-w-[180px]">
                        {activeWallet.address.slice(0, 8)}...{activeWallet.address.slice(-8)}
                      </span>
                    </div>
                    <div className="flex flex-wrap justify-between">
                      <span className="mr-2">Protection:</span>
                      <span
                        className={`font-medium ${activeWallet.isEncrypted ? 'text-avian-600 dark:text-avian-400' : 'text-caution'}`}
                      >
                        {activeWallet.isEncrypted ? 'Password Protected' : 'No Password'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Biometric Authentication - Available and Set Up */}
              {biometricAvailable && (
                <div className="mb-5">
                  <Card className="mb-4 bg-card border border-border">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3">
                        <Button
                          variant="outline"
                          onClick={handleBiometricUnlock}
                          disabled={isLoading || isLockedOut}
                          className="w-full justify-center border-primary hover:bg-primary/10 text-primary hover:text-primary"
                        >
                          {getBiometricIcon()}
                          <span className="truncate">
                            {isLoading
                              ? 'Authenticating...'
                              : isLockedOut
                                ? `Locked (${Math.ceil(lockoutTimeRemaining / 1000)}s)`
                                : 'Unlock with Biometrics'}
                          </span>
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={handleBiometricDisable}
                          disabled={isLoading}
                          className="text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <span>Disable biometric authentication</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex items-center my-4">
                    <div className="flex-1 border-t border-border"></div>
                    <span className="px-3 text-sm text-muted-foreground">OR</span>
                    <div className="flex-1 border-t border-border"></div>
                  </div>
                </div>
              )}

              {/* Biometric Setup Option - When supported but not set up */}
              {biometricSupported && !biometricAvailable && activeWallet && (
                <div className="mb-5">
                  <Card className="mb-4 bg-card border border-border">
                    <CardHeader className="pb-2">
                      <div className="flex items-center">
                        <Fingerprint className="w-5 h-5 text-primary mr-2" />
                        <CardTitle className="text-base font-medium text-foreground">
                          Biometric Authentication
                        </CardTitle>
                      </div>
                      <CardDescription className="text-sm text-muted-foreground">
                        You can set up biometric authentication for this wallet for faster, more
                        secure access.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <BiometricSetupButton
                        walletAddress={activeWallet.address}
                        onSetupComplete={(success) => {
                          if (success) {
                            // Immediately hide the biometric setup section
                            setBiometricAvailable(true);
                            // Then refresh all biometric states to ensure UI is correct
                            setTimeout(() => {
                              checkBiometricSupport();
                            }, 500);
                          }
                        }}
                        className="w-full bg-card dark:bg-transparent border border-primary hover:bg-primary/10 text-avian-600 dark:text-white py-3"
                      />
                    </CardContent>
                  </Card>

                  <div className="flex items-center my-4">
                    <div className="flex-1 border-t border-border"></div>
                    <span className="px-3 text-sm text-muted-foreground">OR</span>
                    <div className="flex-1 border-t border-border"></div>
                  </div>
                </div>
              )}

              {/* Password Authentication */}
              {activeWallet?.isEncrypted ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Wallet Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && !isLockedOut && handlePasswordUnlock()
                        }
                        placeholder="Enter your wallet password"
                        className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-background text-foreground pr-10"
                        disabled={isLoading || isLockedOut}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {error && (
                    <Alert
                      variant="destructive"
                      className="bg-destructive/10 border-destructive/30"
                    >
                      <AlertDescription className="text-sm text-destructive">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={handlePasswordUnlock}
                    disabled={isLoading || isLockedOut || (activeWallet?.isEncrypted && !password)}
                    className="w-full disabled:opacity-50"
                  >
                    <Lock className="w-5 h-5 mr-2" />
                    {isLoading
                      ? 'Unlocking...'
                      : isLockedOut
                        ? `Locked (${Math.ceil(lockoutTimeRemaining / 1000)}s)`
                        : 'Unlock Wallet'}
                  </Button>
                </div>
              ) : (
                /* No Password Required */
                <div className="space-y-4">
                  <Card className="bg-caution/10 border-caution/30">
                    <CardContent className="p-4">
                      <div className="flex items-center">
                        <Shield className="w-5 h-5 text-caution mr-2" />
                        <div className="text-sm">
                          <p className="font-medium text-caution">
                            No Password Required
                          </p>
                          <p className="text-muted-foreground">
                            This wallet is not password protected
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {error && (
                    <Alert
                      variant="destructive"
                      className="bg-destructive/10 border-destructive/30"
                    >
                      <AlertDescription className="text-sm text-destructive">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={handlePasswordUnlock}
                    disabled={isLoading || isLockedOut}
                    className="w-full disabled:opacity-50"
                  >
                    <Lock className="w-5 h-5 mr-2" />
                    {isLoading
                      ? 'Unlocking...'
                      : isLockedOut
                        ? `Locked (${Math.ceil(lockoutTimeRemaining / 1000)}s)`
                        : 'Unlock Wallet'}
                  </Button>
                </div>
              )}

              {/* Security Notice */}
              <Alert className="mt-6 bg-caution/10 border-caution/30">
                <Shield className="h-4 w-4 text-caution" />
                <AlertDescription className="text-xs text-caution">
                  <p className="font-medium">Security Notice</p>
                  <p>
                    Your wallet is protected by advanced security features. All access attempts are
                    logged for your security.
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </GradientBackground>
  );
}
