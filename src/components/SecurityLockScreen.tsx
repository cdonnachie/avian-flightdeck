'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, Eye, EyeOff, Shield, Clock, ArrowRight } from 'lucide-react';
import { securityService } from '@/services/core/SecurityService';
import { StorageService } from '@/services/core/StorageService';
import { toast } from 'sonner';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import BiometricSetupButton from '@/components/BiometricSetupButton';

interface SecurityLockScreenProps {
  onUnlock: (password?: string) => void;
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
        handleUnlockSuccess('Welcome back!', password);
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

  const handleUnlockSuccess = (message: string, password?: string) => {
    toast.success('Wallet unlocked', {
      description: message,
    });
    // Hand the password back so the key is available for silent re-auth this session (password
    // unlocks only; biometric/no-password unlocks pass nothing and re-prompt on demand).
    onUnlock(password);
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

  // If no wallets exist, don't render the lock screen at all
  if (!hasWallets) {
    return null;
  }

  return (
    <div
      className="min-h-screen w-full bg-[#0D1B21]"
      style={{
        backgroundImage:
          'radial-gradient(900px 520px at 82% -8%, rgba(52,245,198,0.07), transparent 60%)',
      }}
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="relative overflow-hidden rounded-2xl border border-[#24404A] bg-[linear-gradient(180deg,#163139,#122730)] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
            {/* artificial-horizon backdrop */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45">
              <div className="absolute inset-x-0 top-0 bottom-[44%] bg-[linear-gradient(180deg,#16525C,#123E46)]" />
              <div className="absolute inset-x-0 top-[56%] bottom-0 bg-[linear-gradient(180deg,#1A1F52,#12163A)]" />
              <div className="absolute inset-x-0 top-[56%] h-0.5 bg-[#34F5C6] opacity-60 shadow-[0_0_12px_rgba(52,245,198,0.5)]" />
            </div>

            <div className="absolute right-3 top-3 z-10">
              <ThemeSwitcher />
            </div>

            <div className="relative px-7 pb-8 pt-9 text-center">
              {/* lock badge */}
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-[rgba(4,18,26,0.55)]">
                {lockReason === 'timeout' ? (
                  <Clock className="h-6 w-6 text-[#F2C46B]" />
                ) : lockReason === 'failed_auth' ? (
                  <Shield className="h-6 w-6 text-[#F0768A]" />
                ) : (
                  <Lock className="h-6 w-6 text-[#34F5C6]" />
                )}
              </div>

              <h1 className="text-xl font-semibold text-[#E6F0F2]">Wallet locked</h1>
              <p className="mt-1 text-sm text-[#9DB4BC]">
                {activeWallet?.isEncrypted
                  ? 'Enter your password to resume'
                  : getLockReasonMessage()}
              </p>
              {activeWallet && (
                <p className="mt-2 font-mono text-xs text-[#6b8088]">
                  {activeWallet.name} · {activeWallet.address.slice(0, 8)}…
                  {activeWallet.address.slice(-6)}
                </p>
              )}

              {activeWallet?.isEncrypted ? (
                <div className="mt-6 space-y-3 text-left">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !isLockedOut && handlePasswordUnlock()}
                      placeholder="Password"
                      autoFocus
                      disabled={isLoading || isLockedOut}
                      aria-label="Wallet password"
                      className="w-full rounded-lg border border-[#24404A] bg-[rgba(4,18,26,0.6)] px-3.5 py-2.5 pr-10 font-mono text-sm text-[#E6F0F2] placeholder:text-[#4D5E68] focus:border-[#34F5C6] focus:outline-none disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9DB4BC] hover:text-[#E6F0F2]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {error && <p className="text-xs text-[#F0768A]">{error}</p>}

                  <button
                    onClick={handlePasswordUnlock}
                    disabled={isLoading || isLockedOut || !password}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#34F5C6,#17A7B6)] px-4 py-3 font-mono text-sm font-semibold uppercase tracking-[0.06em] text-[#06232A] shadow-[0_8px_24px_-10px_rgba(52,245,198,0.5)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {isLoading ? (
                      'Unlocking…'
                    ) : isLockedOut ? (
                      `Locked (${Math.ceil(lockoutTimeRemaining / 1000)}s)`
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4" /> Unlock
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-3 text-left">
                  <div className="flex items-start gap-2.5 rounded-lg border border-[#F2C46B]/30 bg-[#F2C46B]/10 p-3 text-sm text-[#E6F0F2]">
                    <Shield className="mt-0.5 h-4 w-4 flex-none text-[#F2C46B]" />
                    <span>This wallet is not password protected.</span>
                  </div>
                  {error && <p className="text-xs text-[#F0768A]">{error}</p>}
                  <button
                    onClick={handlePasswordUnlock}
                    disabled={isLoading || isLockedOut}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#34F5C6,#17A7B6)] px-4 py-3 font-mono text-sm font-semibold uppercase tracking-[0.06em] text-[#06232A] shadow-[0_8px_24px_-10px_rgba(52,245,198,0.5)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {isLoading ? (
                      'Unlocking…'
                    ) : isLockedOut ? (
                      `Locked (${Math.ceil(lockoutTimeRemaining / 1000)}s)`
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4" /> Continue
                      </>
                    )}
                  </button>
                </div>
              )}

              {biometricAvailable && (
                <div className="mt-4">
                  <button
                    onClick={handleBiometricUnlock}
                    disabled={isLoading || isLockedOut}
                    className="inline-flex items-center gap-2 text-sm text-[#9DB4BC] transition-colors hover:text-[#34F5C6] disabled:opacity-50"
                  >
                    <Fingerprint className="h-4 w-4 text-[#34F5C6]" /> Unlock with biometrics
                  </button>
                  <div>
                    <button
                      onClick={handleBiometricDisable}
                      disabled={isLoading}
                      className="mt-2 text-xs text-[#6b8088] transition-colors hover:text-[#F0768A] disabled:opacity-50"
                    >
                      Disable biometric unlock
                    </button>
                  </div>
                </div>
              )}

              {biometricSupported && !biometricAvailable && activeWallet && (
                <div className="mt-6 border-t border-[#1A333B] pt-5 text-left">
                  <p className="mb-2 text-xs text-[#9DB4BC]">
                    Set up biometric unlock for faster access next time.
                  </p>
                  <BiometricSetupButton
                    walletAddress={activeWallet.address}
                    onSetupComplete={(success) => {
                      if (success) {
                        setBiometricAvailable(true);
                        setTimeout(() => {
                          checkBiometricSupport();
                        }, 500);
                      }
                    }}
                    className="w-full border border-[#24404A] bg-[rgba(4,18,26,0.5)] text-[#E6F0F2] hover:border-[#34F5C6] hover:text-[#34F5C6]"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
