'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from 'react';
import { securityService } from '@/services/core/SecurityService';
import { StorageService } from '@/services/core/StorageService';
import SecurityLockScreen from '@/components/SecurityLockScreen';
import AuthenticationDialog from '@/components/AuthenticationDialog';
import { useWallet } from './WalletContext';
import Image from 'next/image';
import GradientBackground from '@/components/GradientBackground';

interface SecurityContextType {
  /** The opt-in full-screen password wall is showing. */
  screenLocked: boolean;
  /** The wallet password is held in memory for silent re-auth this session. */
  keyUnlocked: boolean;
  /** Whether the screen-lock wall is enabled (opt-in; from settings). */
  screenLockEnabled: boolean;
  /**
   * @deprecated Use `screenLocked` (the UI wall) or `keyUnlocked` (credential availability).
   * Kept as an alias of `screenLocked` for existing consumers (the lock button).
   */
  isLocked: boolean;
  lockWallet: () => Promise<void>;
  unlockWallet: (password?: string, useBiometric?: boolean) => Promise<boolean>;
  requireAuth: (
    message?: string,
    autoLogin?: boolean,
  ) => Promise<{ success: boolean; password?: string }>;
  manualLock: () => Promise<void>;
  wasBiometricAuth: boolean;
  storedWalletPassword?: string;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

// A manual "lock now" is remembered here so it survives a page refresh even when the opt-in
// open-time wall is disabled. sessionStorage (not localStorage) is deliberate: the lock holds
// across reloads of the same tab, but closing the tab clears it — reopening then honours the
// user's open-time setting (no wall if they turned it off).
const MANUAL_LOCK_KEY = 'avian-manual-lock';

function setManualLockFlag(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (on) {
      sessionStorage.setItem(MANUAL_LOCK_KEY, '1');
    } else {
      sessionStorage.removeItem(MANUAL_LOCK_KEY);
    }
  } catch {
    // sessionStorage can throw in locked-down privacy modes; a non-durable lock is acceptable then.
  }
}

function isManuallyLocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MANUAL_LOCK_KEY) === '1';
  } catch {
    return false;
  }
}

interface SecurityProviderProps {
  children: ReactNode;
}

export function SecurityProvider({ children }: SecurityProviderProps) {
  // Get the current wallet address from WalletContext - this might be undefined on initial render
  // We need to use a try-catch because this hook might fail during SSR
  let activeWalletAddress: string | undefined;
  try {
    const walletContext = useWallet();
    activeWalletAddress = walletContext?.address;
  } catch (error) {
    // This is fine, we'll handle the undefined case
  }

  const [isInitializing, setIsInitializing] = useState(true); // Add initializing state
  // The opt-in full-screen wall (was `isLocked`). Split from credential availability so the wallet
  // can load read-only without a password by default; see docs/proposals/optional-lock-screen.md.
  const [screenLocked, setScreenLocked] = useState(false);
  const [screenLockEnabled, setScreenLockEnabled] = useState(false);
  const [lockReason, setLockReason] = useState<'timeout' | 'manual' | 'failed_auth'>('manual');
  const [wasBiometricAuth, setWasBiometricAuth] = useState(false);
  const [storedWalletPassword, setStoredWalletPassword] = useState<string | undefined>();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>('Please authenticate to continue');
  const [currentWalletAddress, setCurrentWalletAddress] = useState<string | undefined>(
    activeWalletAddress,
  );
  const [authResolve, setAuthResolve] = useState<
    ((value: { success: boolean; password?: string }) => void) | null
  >(null);

  // Credential availability: the password is in memory, so requireAuth can silently re-auth.
  const keyUnlocked = storedWalletPassword !== undefined;

  // Read in event callbacks that outlive the render they were created in.
  const screenLockEnabledRef = useRef(false);
  const screenLockedRef = useRef(false);
  useEffect(() => {
    screenLockEnabledRef.current = screenLockEnabled;
  }, [screenLockEnabled]);
  useEffect(() => {
    screenLockedRef.current = screenLocked;
  }, [screenLocked]);

  useEffect(() => {
    // Initialize security service and check if the wall should be shown
    const initSecurity = async () => {
      try {
        // Check terms acceptance FIRST - security requires terms acceptance
        const termsAccepted = localStorage.getItem('terms-accepted');

        if (!termsAccepted) {
          // Terms not accepted, no wall regardless of wallet state
          setScreenLocked(false);
          setIsInitializing(false);
          return;
        }

        // Whether the opt-in wall is enabled for this install.
        const settings = await securityService.getSecuritySettings();
        const wallEnabled = settings.autoLock?.screenLockEnabled === true;
        setScreenLockEnabled(wallEnabled);
        screenLockEnabledRef.current = wallEnabled;

        const activeWallet = await StorageService.getActiveWallet();

        // Raise the wall on start when a wallet exists AND either the user opted into the open-time
        // wall, or they manually locked earlier this session (which persists across refresh). A
        // manual lock always wins; otherwise fall back to the service's locked state. With neither,
        // the wallet loads read-only and sensitive actions prompt on demand.
        const manuallyLocked = isManuallyLocked();
        if (activeWallet && (wallEnabled || manuallyLocked)) {
          setScreenLocked(manuallyLocked || (await securityService.isLocked()));
          if (manuallyLocked) {
            setLockReason('manual');
          }
        } else {
          setScreenLocked(false);
        }
      } catch (error) {
        // Default to no wall if there's an error
        setScreenLocked(false);
      } finally {
        // Mark initialization as complete
        setIsInitializing(false);
      }
    };

    initSecurity();

    // Listen for changes to terms acceptance (e.g., when user returns from /terms)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'terms-accepted' && e.newValue) {
        // Terms were just accepted, re-initialize security
        setIsInitializing(true);
        initSecurity();
      }
    };

    // Listen for custom terms acceptance event
    const handleTermsAccepted = (e: CustomEvent) => {
      if (e.detail?.accepted) {
        setIsInitializing(true);
        initSecurity();
      }
    };

    // Also listen for focus events in case user navigates back from terms page
    const handleFocus = () => {
      const termsAccepted = localStorage.getItem('terms-accepted');
      if (termsAccepted && !isInitializing) {
        // Terms are now accepted but we might be in unlocked state, re-check
        initSecurity();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('terms-accepted', handleTermsAccepted as EventListener);

    // Listen for lock state changes from the service (auto-lock timeout, failed-auth, manual).
    // The wall is only raised for a timeout/failed-auth lock when the user enabled it; a manual
    // lock always raises it (the user explicitly asked to lock).
    const unsubscribe = securityService.onLockStateChange(
      (locked: boolean, reason?: 'timeout' | 'manual' | 'failed_auth') => {
        const raiseWall =
          locked && (reason === 'manual' || screenLockEnabledRef.current);
        setScreenLocked(raiseWall);
        if (reason) {
          setLockReason(reason);
        }
        // A lock (from any source) forgets the in-memory password, so the next sensitive action
        // must re-authenticate — this is the credential half of "locking".
        if (locked) {
          setStoredWalletPassword(undefined);
          setWasBiometricAuth(false);
        }
      },
    );

    // Set up user activity tracking to prevent timeout when user is active
    const userActivityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    const handleUserActivity = () => {
      // Only reset auto-lock while the wall is not showing
      if (!screenLockedRef.current) {
        securityService.resetAutoLock();
      }
    };

    // Add event listeners for all user activity events
    userActivityEvents.forEach((eventType) => {
      window.addEventListener(eventType, handleUserActivity, { passive: true });
    });

    // Clean up event listeners on unmount
    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('terms-accepted', handleTermsAccepted as EventListener);
      userActivityEvents.forEach((eventType) => {
        window.removeEventListener(eventType, handleUserActivity);
      });
    };
    // Intentionally run once: the callbacks read the live values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockWallet = async () => {
    // A manual lock raises the wall and forgets the session password. Remember it so a refresh
    // keeps the wall up even when the open-time wall is disabled.
    setManualLockFlag(true);
    await securityService.lockWallet('manual');
    setScreenLocked(true);
    setLockReason('manual');
    setWasBiometricAuth(false);
    setStoredWalletPassword(undefined);
  };

  const unlockWallet = async (password?: string, useBiometric?: boolean) => {
    if (useBiometric) {
      // Get the biometric authentication result directly to access the wallet password
      const biometricAvailable = await securityService.isBiometricAuthAvailable();
      if (biometricAvailable) {
        const biometricResult = await securityService.authenticateWithBiometric();
        if (biometricResult.success) {
          setManualLockFlag(false);
          setWasBiometricAuth(true);
          setStoredWalletPassword(biometricResult.walletPassword);
          setScreenLocked(false);
          return true;
        }
        return false;
      }
      return false;
    } else {
      const success = await securityService.unlockWallet(password, false);
      if (success) {
        setManualLockFlag(false);
        setScreenLocked(false);
        setWasBiometricAuth(false);
        // Store the password if provided
        if (password) {
          setStoredWalletPassword(password);
        } else {
          setStoredWalletPassword(undefined);
        }
      }
      return success;
    }
  };

  const handleAuthentication = useCallback(
    (password: string) => {
      if (authResolve) {
        setWasBiometricAuth(false); // This was a manual password entry
        setStoredWalletPassword(password);
        authResolve({ success: true, password });
        setShowAuthDialog(false);
        setAuthResolve(null);
      }
    },
    [authResolve],
  );

  const handleAuthCancel = useCallback(() => {
    if (authResolve) {
      authResolve({ success: false });
      setShowAuthDialog(false);
      setAuthResolve(null);
    }
  }, [authResolve]);

  const requireAuth = async (
    message?: string,
    autoLogin: boolean = false,
  ): Promise<{ success: boolean; password?: string }> => {
    // NOTE: this intentionally no longer early-returns on the UI wall. Authentication is gated on
    // whether the KEY is available, not on whether the wall is showing — so it works in both the
    // load-then-authenticate (no wall) and screen-lock (wall) modes. It must still FAIL CLOSED:
    // the only path that succeeds without prompting requires a password already in memory.
    try {
      // If password is already stored from a previous authentication this session
      if (storedWalletPassword && autoLogin) {
        return {
          success: true,
          password: storedWalletPassword,
        };
      }

      // Check if biometrics are available, configured in settings, and enabled for this specific wallet
      const settings = await securityService.getSecuritySettings();
      const globalBiometricEnabled = settings.biometric.enabled;

      // Get the active wallet to check if biometrics are enabled for it
      const activeWallet = await StorageService.getActiveWallet();
      const walletBiometricEnabled = activeWallet?.biometricsEnabled === true;

      // Only proceed with biometric auth if both global setting AND wallet-specific setting are enabled
      const biometricAvailable =
        globalBiometricEnabled &&
        walletBiometricEnabled &&
        (await securityService.isBiometricAuthAvailable());

      if (biometricAvailable) {
        // Try biometric auth first
        const biometricResult = await securityService.authenticateWithBiometric();

        if (biometricResult.success && biometricResult.walletPassword) {
          setWasBiometricAuth(true);
          setStoredWalletPassword(biometricResult.walletPassword);
          return {
            success: true,
            password: biometricResult.walletPassword,
          };
        }
      }

      // If we get here, we need to show the auth dialog
      return new Promise((resolve) => {
        setCurrentWalletAddress(activeWallet?.address);
        setAuthMessage(message || 'Please authenticate to continue');
        setAuthResolve(() => resolve);
        setShowAuthDialog(true);
      });
    } catch (error) {
      return { success: false };
    }
  };

  const manualLock = async () => {
    setManualLockFlag(true);
    await securityService.lockWallet('manual');
    setScreenLocked(true);
    setLockReason('manual');
    setWasBiometricAuth(false);
    setStoredWalletPassword(undefined);
  };

  // Called by the lock screen when the user unlocks it. A password unlock hands the password back
  // so the key is available for the rest of the session; a biometric unlock does not (the next
  // sensitive action re-runs the quick biometric prompt).
  const handleUnlock = (password?: string) => {
    // A successful unlock clears any remembered manual lock, so a later refresh does not re-lock.
    setManualLockFlag(false);
    setScreenLocked(false);
    if (password) {
      setStoredWalletPassword(password);
      setWasBiometricAuth(false);
    }
  };

  // Show nothing while initializing to prevent flicker
  if (isInitializing) {
    return (
      <GradientBackground>
        <div className="fixed inset-0 flex h-full w-full items-center justify-center z-50">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="flex items-center justify-center">
              <Image src="/avian_spinner.png" alt="Loading..." width={96} height={96} unoptimized />
            </div>
            <p className="text-sm text-muted-foreground animate-pulse">Loading wallet...</p>
          </div>
        </div>
      </GradientBackground>
    );
  }

  return (
    <SecurityContext.Provider
      value={{
        screenLocked,
        keyUnlocked,
        screenLockEnabled,
        isLocked: screenLocked,
        lockWallet,
        unlockWallet,
        requireAuth,
        manualLock,
        wasBiometricAuth,
        storedWalletPassword,
      }}
    >
      {/* The provider is always mounted (so requireAuth works and the default no-wall mode loads
          the wallet read-only). When the opt-in wall is up we render it in place of the wallet
          subtree — there is no read-only view to show behind a full-screen wall anyway. */}
      {screenLocked ? (
        <SecurityLockScreen onUnlock={handleUnlock} lockReason={lockReason} />
      ) : (
        children
      )}
      <AuthenticationDialog
        isOpen={showAuthDialog}
        onClose={handleAuthCancel}
        onAuthenticate={handleAuthentication}
        message={authMessage}
        walletAddress={currentWalletAddress}
      />
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
