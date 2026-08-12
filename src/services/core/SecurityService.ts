import {
  BiometricCapabilities,
  BiometricAuthResult,
  BiometricType,
  SecurityAuditEntry,
  SecurityAction,
  AutoLockSettings,
  SecuritySettings,
  SecurityState,
} from '@/types/security';
import { StorageService } from './StorageService';
// Encryption helpers come from the lean module so this service — instantiated eagerly by the
// lock screen — does not pull the secp256k1 build. The elliptic-curve validation it needs on the
// legacy-upgrade path is loaded lazily via initializeCrypto() below, and bip39 lazily at its one
// use site, so neither is in the initial bundle.
import { secureEncrypt, decryptData } from '../wallet/encryption';
import { securityLogger } from '@/lib/Logger';
import { isBrowser } from '@/lib/utils';

// Dynamic imports for bitcoin libraries to avoid SSR issues
let bitcoin: any = null;
let ECPairFactory: any = null;
let ecc: any = null;
let ECPair: any = null;

// Initialize crypto libraries asynchronously
const initializeCrypto = async () => {
  if (typeof window === 'undefined') {
    // Server-side: return mock implementations
    return {
      bitcoin: null,
      ECPair: null,
      ecc: null,
    };
  }

  if (bitcoin && ECPair && ecc) {
    return { bitcoin, ECPair, ecc };
  }

  try {
    // Dynamic imports to avoid SSR issues
    const [bitcoinModule, ecpairModule, eccModule] = await Promise.all([
      import('bitcoinjs-lib'),
      import('ecpair'),
      import('tiny-secp256k1'),
    ]);

    bitcoin = bitcoinModule;
    ECPairFactory = ecpairModule.ECPairFactory;
    ecc = eccModule as any;
    ECPair = ECPairFactory(ecc);

    return { bitcoin, ECPair, ecc };
  } catch (error) {
    securityLogger.warn('Failed to load crypto libraries:', error);
    return { bitcoin: null, ECPair: null, ecc: null };
  }
};

// Avian network configuration for validation
const getAvianNetwork = () => ({
  messagePrefix: '\x16Raven Signed Message:\n',
  bech32: '',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x3c, // Avian addresses start with 'R'
  scriptHash: 0x7a,
  wif: 0x80,
});

export class SecurityService {
  private static instance: SecurityService | null = null;
  private securityState: SecurityState = {
    isLocked: true, // Default to locked for security
    lastActivity: Date.now(),
    biometricAvailable: false,
    requiresPasswordUnlock: false,
  };
  private autoLockTimer: NodeJS.Timeout | null = null;
  private activityListeners: (() => void)[] = [];
  private lockStateListeners: ((
    isLocked: boolean,
    reason?: 'timeout' | 'manual' | 'failed_auth',
  ) => void)[] = [];
  private initialized: boolean = false;
  private failedAttempts: number = 0;
  private lastFailedAttempt: number = 0;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 300000; // 5 minutes in milliseconds

  constructor() {
    this.setupActivityTracking();
    // Only load from storage if in browser environment
    if (isBrowser()) {
      this.loadFailedAttemptsFromStorage();
    }
    // Don't call initializeSecurity here - wait for first use
  }

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  // Initialize security features
  private async initializeSecurity() {
    if (this.initialized) return;

    try {
      const settings = await this.getSecuritySettings();

      // Check both hardware capability AND settings
      this.securityState.biometricAvailable = await this.isBiometricAuthAvailable();

      if (settings.autoLock.enabled) {
        // Initializing auto-lock with settings
        this.setupAutoLock(settings.autoLock);
      } else {
        // Auto-lock is disabled in settings
      }

      // Check if we should start in locked state (only in browser)
      if (isBrowser()) {
        // Check if there are any stored wallets
        const activeWallet = await StorageService.getActiveWallet();

        if (activeWallet) {
          // Check for a persistent session marker to avoid locking on refresh
          const sessionActive = sessionStorage.getItem('security_session_active');

          if (sessionActive === 'true') {
            // Session is active, keep the wallet unlocked
            this.securityState.isLocked = false;
          } else {
            // No active session, lock for security
            this.securityState.isLocked = true;
            this.securityState.lockReason = 'manual';
          }
        } else {
          // No wallet exists, safe to unlock
          this.securityState.isLocked = false;
        }
      } else {
        // Server-side, always start locked for security
        this.securityState.isLocked = true;
      }

      this.initialized = true;
    } catch (error) {
      securityLogger.error('Failed to initialize security:', error);
    }
  }

  // Ensure initialization before using security features
  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initializeSecurity();
    }
  }

  // Biometric Authentication using WebAuthn
  async checkBiometricSupport(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      // Check for Web Authentication API (WebAuthn)
      if (!('credentials' in navigator) || !('create' in navigator.credentials)) {
        securityLogger.warn('WebAuthn not supported in this browser');
        return false;
      }

      // Check if the platform supports user verification
      const isSupported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

      return isSupported;
    } catch (error) {
      securityLogger.error('Error checking biometric support:', error);
      return false;
    }
  }

  async getBiometricCapabilities(): Promise<BiometricCapabilities> {
    const isSupported = await this.checkBiometricSupport();

    if (!isSupported) {
      return {
        isSupported: false,
        availableTypes: [],
        isEnrolled: false,
      };
    }

    // Detect available biometric types based on platform
    const availableTypes: any[] = [];

    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent;

      if (/iPhone|iPad|iPod/.test(userAgent)) {
        // iOS devices - check iOS version for Face ID support
        const iOSVersion = this.getIOSVersion();
        if (iOSVersion >= 11) {
          availableTypes.push('face'); // Face ID
        }
        availableTypes.push('fingerprint'); // Touch ID
      } else if (/Android/.test(userAgent)) {
        // Android devices
        availableTypes.push('fingerprint');
        // Android 10+ supports face unlock via WebAuthn
        const androidVersion = this.getAndroidVersion();
        if (androidVersion >= 10) {
          availableTypes.push('face');
        }
      } else if (navigator.platform.includes('Win')) {
        // Windows Hello
        availableTypes.push('fingerprint', 'face');
      } else if (navigator.platform.includes('Mac')) {
        // macOS Touch ID
        availableTypes.push('fingerprint');
      }
    }

    return {
      isSupported,
      availableTypes,
      isEnrolled: isSupported, // WebAuthn will handle enrollment check
    };
  }

  private getIOSVersion(): number {
    const match = navigator.userAgent.match(/OS (\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private getAndroidVersion(): number {
    const match = navigator.userAgent.match(/Android (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async setupBiometricAuth(userId?: string, walletPassword?: string): Promise<boolean> {
    try {
      // First check if biometrics are enabled in security settings
      const settings = await this.getSecuritySettings();
      if (!settings.biometric.enabled) {
        await this.logSecurityEvent(
          'biometric_setup',
          'Biometric setup attempted but biometrics are disabled in settings',
          false,
        );
        throw new Error('Biometric authentication is disabled in security settings');
      }

      // Then check hardware capabilities
      const capabilities = await this.getBiometricCapabilities();
      if (!capabilities.isSupported) {
        throw new Error('Biometric authentication not supported');
      }

      // Generate a unique user ID if not provided
      const effectiveUserId = userId || (await this.generateUserId());

      // Get the current wallet
      const activeWallet = await StorageService.getActiveWallet();
      if (!activeWallet) {
        throw new Error('No active wallet found for biometric setup');
      }

      // If the wallet is encrypted, the password MUST be provided and validated first.
      if (activeWallet.isEncrypted) {
        if (!walletPassword) {
          await this.logSecurityEvent(
            'biometric_setup',
            'Biometric setup failed: Password not provided for encrypted wallet.',
            false,
          );
          throw new Error('Password is required to set up biometrics for an encrypted wallet.');
        }
        const isPasswordValid = await this.validateWalletPassword(
          activeWallet.privateKey,
          walletPassword,
        );
        if (!isPasswordValid) {
          await this.logSecurityEvent(
            'biometric_setup',
            'Biometric setup failed: Invalid password provided.',
            false,
          );
          throw new Error('Invalid wallet password.');
        }
      }

      // Create WebAuthn credential for biometric authentication
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: {
            name: 'Avian FlightDeck',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(effectiveUserId),
            name: activeWallet.address, // Use wallet address instead of generic "wallet-user"
            displayName: `Wallet ${activeWallet.address.substring(0, 8)}...`, // More user-friendly display
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            requireResidentKey: false,
          },
          timeout: 60000,
          attestation: 'direct',
        },
      } as CredentialCreationOptions);

      if (credential) {
        // We already have the active wallet from earlier

        // Store credential ID for future authentication
        const credentialId = Array.from(new Uint8Array((credential as any).rawId));

        // Store both for the specific wallet and as the default
        await StorageService.setBiometricCredential(credentialId, activeWallet.address);

        // Save the updated wallet with biometric flag directly in wallet record
        await StorageService.saveWalletWithBiometricData(activeWallet, credentialId);

        // If a wallet password was provided, store it securely associated with this credential
        if (walletPassword) {
          // Create a secure key based on the credential ID
          const secureKey = credentialId.join('-');

          // Encrypt the wallet password with this secure key
          // This ensures the password is only accessible when the biometric authentication succeeds
          await StorageService.setEncryptedWalletPassword(
            secureKey,
            walletPassword,
            activeWallet.address,
          );
        }

        await this.logSecurityEvent(
          'biometric_setup',
          'Biometric authentication setup successful',
          true,
        );
        return true;
      }

      return false;
    } catch (error) {
      securityLogger.error('Error setting up biometric authentication:', error);
      await this.logSecurityEvent('biometric_setup', `Biometric setup failed: ${error}`, false);
      return false;
    }
  }

  async authenticateWithBiometric(): Promise<BiometricAuthResult> {
    try {
      // First check if biometrics are enabled in security settings
      const settings = await this.getSecuritySettings();
      if (!settings.biometric.enabled) {
        return {
          success: false,
          error: 'Biometric authentication is disabled in security settings',
        };
      }

      const capabilities = await this.getBiometricCapabilities();

      if (!capabilities.isSupported) {
        return {
          success: false,
          error: 'Biometric authentication not supported',
        };
      }

      // Get active wallet first to look up wallet-specific credentials
      const activeWallet = await StorageService.getActiveWallet();
      if (!activeWallet) {
        return {
          success: false,
          error: 'No active wallet found',
        };
      }

      // Get stored credential ID for this specific wallet
      const storedCredentialId = await StorageService.getBiometricCredential(activeWallet.address);
      if (!storedCredentialId) {
        return {
          success: false,
          error:
            'No biometric credential found for this wallet. Please set up biometric authentication first.',
        };
      }

      // Convert stored credential ID back to Uint8Array
      const credentialId = new Uint8Array(storedCredentialId);

      // Perform WebAuthn authentication
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [
            {
              id: credentialId,
              type: 'public-key',
              transports: ['internal'], // Platform authenticator
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      } as CredentialRequestOptions);

      if (assertion) {
        await this.logSecurityEvent('biometric_auth', 'Biometric authentication successful', true);

        // Get active wallet
        const activeWallet = await StorageService.getActiveWallet();
        if (!activeWallet) {
          return {
            success: false,
            error: 'No active wallet found',
          };
        }

        // Retrieve the stored wallet password for this specific wallet
        const secureKey = storedCredentialId.join('-');
        const walletPassword = await StorageService.getEncryptedWalletPassword(
          secureKey,
          activeWallet.address,
        );

        // Determine biometric type based on platform
        let biometricType: BiometricType = 'fingerprint'; // default
        if (typeof window !== 'undefined') {
          const userAgent = navigator.userAgent;
          if (/iPhone|iPad|iPod/.test(userAgent)) {
            // On iOS, we can't definitively know if Face ID or Touch ID was used
            // Modern iOS devices primarily use Face ID
            const iOSVersion = this.getIOSVersion();
            biometricType = iOSVersion >= 11 ? 'face' : 'fingerprint';
          } else if (/Android/.test(userAgent)) {
            // Android could be fingerprint or face
            biometricType = 'fingerprint'; // Most common
          }
        }

        return {
          success: true,
          biometricType,
          walletPassword: walletPassword || undefined, // Return the wallet password for unlocking
        };
      }

      return {
        success: false,
        error: 'Biometric authentication failed',
      };
    } catch (error: any) {
      await this.logSecurityEvent(
        'biometric_auth',
        `Biometric authentication failed: ${error}`,
        false,
      );

      // Handle specific WebAuthn errors
      let errorMessage = 'Biometric authentication failed';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Biometric authentication was cancelled or not allowed';
      } else if (error.name === 'InvalidStateError') {
        errorMessage = 'Biometric authentication is not available';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Biometric authentication is not supported';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Biometric authentication security error';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Biometric authentication was aborted';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async generateUserId(): Promise<string> {
    // Generate a unique user ID based on the full wallet address for better identification
    try {
      const activeWallet = await StorageService.getActiveWallet();
      if (activeWallet) {
        // Return the full wallet address as the user ID for better traceability
        return activeWallet.address;
      }
    } catch (error) {
      securityLogger.warn('Could not get active wallet for user ID generation');
    }

    // Fallback to random ID if no wallet is found
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Auto-lock functionality
  setupAutoLock(settings: AutoLockSettings) {
    this.clearAutoLock();

    if (!settings.enabled) {
      // Auto-lock is disabled in settings
      return;
    }

    // Setting up auto-lock timer

    this.autoLockTimer = setTimeout(() => {
      // Auto-lock timer triggered, locking wallet
      this.lockWallet('timeout');
    }, settings.timeout);

    // Verify timer was set
    const lockTime = new Date(Date.now() + settings.timeout);
    // Auto-lock timer status
  }

  clearAutoLock() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  /**
   * Resets the auto-lock timer based on user activity
   * This ensures the wallet doesn't lock while the user is actively using it
   *
   * @param verbose Whether to log the reset (default false to reduce console noise)
   */
  resetAutoLock(verbose: boolean = false) {
    // Get current security settings
    this.getSecuritySettings()
      .then((settings) => {
        // Only reset if auto-lock is enabled and the wallet is not locked
        if (settings.autoLock.enabled && !this.securityState.isLocked) {
          // Clear the existing timer and set up a new one
          this.clearAutoLock();
          this.setupAutoLock(settings.autoLock);
        } else {
        }
      })
      .catch((err) => {
        securityLogger.error('[SecurityService] Error resetting auto-lock timer:', err);
      });
  }

  updateActivity() {
    this.securityState.lastActivity = Date.now();

    // Only use localStorage in browser environment
    if (isBrowser()) {
      localStorage.setItem('lastActivity', this.securityState.lastActivity.toString());
    }

    // Reset auto-lock timer with enhanced logging for better debugging

    this.resetAutoLock(true);
  }

  private setupActivityTracking() {
    if (typeof window === 'undefined') return;

    // Setting up activity tracking

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const throttledUpdate = this.throttle(() => this.updateActivity(), 1000);

    events.forEach((event) => {
      document.addEventListener(event, throttledUpdate, true);
    });

    // Activity tracking initialized on events
  }

  private throttle(func: Function, wait: number) {
    let timeout: NodeJS.Timeout | null = null;
    let lastCallTime = 0;

    return function executedFunction(...args: any[]) {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTime;

      // Clear previous timeout
      clearTimeout(timeout!);

      const later = () => {
        lastCallTime = Date.now();
        timeout = null;
        func(...args);
      };

      // Set new timeout
      timeout = setTimeout(later, wait);
    };
  }

  // Lock/Unlock functionality
  async lockWallet(reason: 'timeout' | 'manual' | 'failed_auth' = 'manual') {
    // Locking wallet with reason: ${reason}

    // Check if there are any wallets before locking
    const wallets = await StorageService.getAllWallets();
    if (wallets.length === 0) {
      // If no wallets exist, don't lock and ensure we're unlocked
      if (this.securityState.isLocked) {
        // No wallets exist, ensuring unlocked state
        this.securityState.isLocked = false;
        this.notifyLockStateChange(false);
      }
      return;
    }

    // For timeout locks, check if requirePasswordAfterTimeout is enabled
    if (reason === 'timeout') {
      const settings = await this.getSecuritySettings();
      // Auto-lock timeout triggered, settings:

      if (!settings.autoLock.requirePasswordAfterTimeout) {
        // If requirePasswordAfterTimeout is disabled, don't lock the wallet for timeout
        // Auto-lock skipped: requirePasswordAfterTimeout is disabled
        await this.logSecurityEvent(
          'auto_lock_triggered',
          'Wallet auto-lock skipped: requirePasswordAfterTimeout disabled',
          true,
        );
        return;
      }
    }

    // Setting locked state
    this.securityState.isLocked = true;
    this.securityState.lockReason = reason;
    this.clearAutoLock();

    // Clear session state when locking
    if (isBrowser()) {
      sessionStorage.removeItem('security_session_active');
    }

    await this.logSecurityEvent('wallet_lock', `Wallet locked: ${reason}`, true);
    this.notifyLockStateChange(true);
  }

  async unlockWallet(password?: string, useBiometric: boolean = false): Promise<boolean> {
    try {
      await this.ensureInitialized();

      // Check for lockout due to failed attempts
      if (this.isLockedOut()) {
        const timeRemaining = this.getRemainingLockoutTime();
        await this.logSecurityEvent(
          'password_auth',
          `Unlock attempt during lockout period (${Math.ceil(timeRemaining / 1000)}s remaining)`,
          false,
        );
        throw new Error(
          `Too many failed attempts. Please wait ${Math.ceil(timeRemaining / 1000)} seconds before trying again.`,
        );
      }

      // If user wants to use biometrics, check if they're available and enabled
      if (useBiometric) {
        // Check global biometric settings
        const settings = await this.getSecuritySettings();
        const globalBiometricEnabled = await StorageService.isBiometricEnabled();

        // Check wallet-specific biometric settings
        const activeWallet = await StorageService.getActiveWallet();
        const walletBiometricEnabled = activeWallet?.biometricsEnabled === true;

        // Only proceed with biometric auth if both global setting AND wallet-specific setting are enabled
        const biometricAvailable =
          globalBiometricEnabled && walletBiometricEnabled && (await this.checkBiometricSupport());

        if (!biometricAvailable) {
          await this.logSecurityEvent(
            'biometric_auth',
            'Biometric authentication attempted but disabled in settings or not enabled for this wallet',
            false,
          );
          return false;
        }

        const biometricResult = await this.authenticateWithBiometric();
        if (biometricResult.success) {
          // If the wallet is encrypted, we need a password
          const activeWallet = await StorageService.getActiveWallet();
          if (activeWallet?.isEncrypted && !biometricResult.walletPassword) {
            await this.logSecurityEvent(
              'biometric_auth',
              'Biometric authentication succeeded but no stored password found',
              false,
            );
            return false;
          }

          // If we have a stored password for an encrypted wallet, validate it
          if (activeWallet?.isEncrypted && biometricResult.walletPassword) {
            const isValidPassword = await this.validateWalletPassword(
              activeWallet.privateKey,
              biometricResult.walletPassword,
            );

            if (!isValidPassword) {
              await this.logSecurityEvent(
                'biometric_auth',
                'Stored biometric password is invalid',
                false,
              );
              return false;
            }
          }

          this.resetFailedAttempts();
          this.securityState.isLocked = false;
          this.securityState.requiresPasswordUnlock = false;
          this.updateActivity();

          // Mark session as active for this tab
          if (isBrowser()) {
            sessionStorage.setItem('security_session_active', 'true');
          }

          await this.logSecurityEvent('wallet_unlock', 'Wallet unlocked with biometric', true);
          this.notifyLockStateChange(false);
          return true;
        } else {
          // Biometric authentication failed
          await this.logSecurityEvent(
            'biometric_auth',
            `Biometric authentication failed: ${biometricResult.error}`,
            false,
          );
          return false;
        }
      }

      // Password authentication
      const activeWallet = await StorageService.getActiveWallet();
      if (!activeWallet) {
        return false;
      }

      if (activeWallet.isEncrypted) {
        if (!password) {
          return false;
        }

        try {
          // Validate password by attempting to decrypt the private key
          const { decrypted, format } = await decryptData(activeWallet.privateKey, password);

          // The legacy format carries no authentication tag, so a wrong password does not
          // reliably fail — it can decrypt to plausible-looking rubbish. Checking that the
          // result is a usable key is the only way to tell the two apart, and it has to happen
          // before anything is written back: re-encrypting rubbish over the stored key would
          // destroy the wallet outright. ECC is loaded lazily so it stays out of the initial
          // bundle; validate the WIF here the same way validateWalletPassword does.
          const { ECPair: ECPairLib } = await initializeCrypto();
          try {
            if (ECPairLib) {
              ECPairLib.fromWIF(decrypted, getAvianNetwork());
            } else if (
              !(
                decrypted.length >= 51 &&
                decrypted.length <= 52 &&
                /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(decrypted)
              )
            ) {
              throw new Error('invalid WIF');
            }
          } catch {
            throw new Error('Decrypted value is not a valid private key, password incorrect.');
          }

          // Upgrade the stored ciphertext to the current (v2) KDF profile if it isn't already —
          // this covers both the old interactive-scrypt (v1) format and the unauthenticated legacy
          // format. The key was just validated as a real WIF, so re-encrypting it is safe.
          if (format !== 'v2') {
            securityLogger.info(`Upgrading encryption for wallet: ${activeWallet.name}`);
            const newEncryptedKey = await secureEncrypt(decrypted, password);

            let newEncryptedMnemonic: string | undefined = undefined;
            // Also upgrade the mnemonic if it exists
            if (activeWallet.mnemonic) {
              try {
                // Decrypt in whatever format it is stored (v1/legacy), then re-seal as v2.
                const { decrypted: decryptedMnemonic } = await decryptData(
                  activeWallet.mnemonic,
                  password,
                );
                // Same reasoning as the key above: only store something that is demonstrably
                // a real mnemonic, or the user's recovery phrase is lost. bip39 is loaded lazily
                // so it stays out of the initial bundle.
                const bip39 = await import('bip39');
                if (decryptedMnemonic && bip39.validateMnemonic(decryptedMnemonic)) {
                  newEncryptedMnemonic = await secureEncrypt(decryptedMnemonic, password);
                }
              } catch (mnemonicError) {
                securityLogger.error(
                  `Failed to upgrade mnemonic for wallet ${activeWallet.name}:`,
                  mnemonicError,
                );
                // Continue with private key upgrade even if mnemonic fails
              }
            }

            await StorageService.updateWalletEncryption(
              activeWallet.id!,
              newEncryptedKey,
              newEncryptedMnemonic,
            );
          }
        } catch (error) {
          // Decryption failed, so the password was incorrect.
          this.recordFailedAttempt();
          await this.logSecurityEvent('password_auth', 'Invalid password attempt', false);

          // Check if we should lock the wallet due to too many failed attempts
          if (this.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
            await this.lockWallet('failed_auth');
            throw new Error(
              `Wallet locked due to ${this.MAX_FAILED_ATTEMPTS} failed password attempts. Please wait ${this.LOCKOUT_DURATION / 60000} minutes.`,
            );
          }

          return false;
        }

        this.resetFailedAttempts();
        this.securityState.isLocked = false;
        this.securityState.requiresPasswordUnlock = false;
        this.updateActivity();

        // Mark session as active for this tab
        if (isBrowser()) {
          sessionStorage.setItem('security_session_active', 'true');
        }

        await this.logSecurityEvent('password_auth', 'Wallet unlocked with password', true);
        this.notifyLockStateChange(false);
        return true;
      } else {
        // Non-encrypted wallet, allow unlock without password
        this.resetFailedAttempts();
        this.securityState.isLocked = false;
        this.updateActivity();

        // Mark session as active for this tab
        if (isBrowser()) {
          sessionStorage.setItem('security_session_active', 'true');
        }

        this.notifyLockStateChange(false);
        await this.logSecurityEvent('wallet_unlock', 'Non-encrypted wallet unlocked', true);
        return true;
      }
    } catch (error) {
      securityLogger.error('Unlock error:', error);
      await this.logSecurityEvent('wallet_unlock', `Wallet unlock error: ${error}`, false);
      throw error; // Re-throw to allow UI to handle the specific error message
    }
  }

  /**
   * Validate wallet password by attempting to decrypt the private key
   */
  private async validateWalletPassword(
    encryptedPrivateKey: string,
    password: string,
  ): Promise<boolean> {
    try {
      // Attempt to decrypt the private key
      const { decrypted, wasLegacy } = await decryptData(encryptedPrivateKey, password);

      // If decryption returns an empty string, the password was incorrect
      if (!decrypted) {
        return false;
      }

      // Initialize ECC if not already done
      const { ECPair: ECPairLib } = await initializeCrypto();

      if (!ECPairLib) {
        // If ECC library failed to load, fall back to basic validation
        securityLogger.warn('ECC library not available, using basic WIF validation'); // Basic WIF format validation (length and characters)
        return (
          decrypted.length >= 51 &&
          decrypted.length <= 52 &&
          /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(decrypted)
        );
      }

      // Verify the decrypted key is valid WIF format for Avian network
      ECPairLib.fromWIF(decrypted, getAvianNetwork());
      return true;
    } catch (error) {
      // If decryption or WIF parsing fails, password is incorrect
      return false;
    }
  }

  // Security Audit Log
  async logSecurityEvent(
    action: SecurityAction,
    details: string,
    success: boolean,
    walletAddress?: string,
  ) {
    try {
      // Don't log during initialization to prevent recursion
      if (!this.initialized) return;

      const settings = await this.getSecuritySettings();
      if (!settings.auditLog.enabled) return;

      const entry: SecurityAuditEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        action,
        details,
        success,
        walletAddress,
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
        ipAddress: undefined, // Would need server-side for real IP
      };

      const auditLog = await this.getSecurityAuditLog();
      auditLog.push(entry);

      // Trim log if it exceeds max entries
      if (auditLog.length > settings.auditLog.maxEntries) {
        auditLog.splice(0, auditLog.length - settings.auditLog.maxEntries);
      }

      // Remove old entries based on retention
      const cutoffTime = Date.now() - settings.auditLog.retentionDays * 24 * 60 * 60 * 1000;
      const filteredLog = auditLog.filter((entry) => entry.timestamp > cutoffTime);

      await StorageService.setSettings({
        ...(await StorageService.getSettings()),
        security_audit_log: filteredLog,
      });

      // Process the event for notifications if a wallet address is provided
      // Use dynamic import to avoid circular dependencies
      if (walletAddress) {
        // We use setTimeout to make this non-blocking
        setTimeout(async () => {
          try {
            const { SecurityNotificationService } = await import(
              '@/services/notifications/client/SecurityNotificationService'
            );
            await SecurityNotificationService.processSecurityEvent(entry);
          } catch (notifyError) {
            securityLogger.error('Failed to process security notification:', notifyError);
          }
        }, 0);
      }
    } catch (error) {
      securityLogger.error('Failed to log security event:', error);
    }
  }

  async getSecurityAuditLog(): Promise<SecurityAuditEntry[]> {
    try {
      const settings = await StorageService.getSettings();
      return settings?.security_audit_log || [];
    } catch (error) {
      securityLogger.error('Failed to get security audit log:', error);
      return [];
    }
  }

  async clearSecurityAuditLog(): Promise<void> {
    const settings = await StorageService.getSettings();
    delete settings?.security_audit_log;
    await StorageService.setSettings(settings || {});
  }

  // Settings management
  async getSecuritySettings(): Promise<SecuritySettings> {
    try {
      const allSettings = await StorageService.getSettings();
      const settings = allSettings?.security_settings;
      if (settings) {
        // Migrate pre-existing installs that predate the screen-lock toggle: they have been
        // living with the full password wall, so keep it on rather than silently dropping it.
        if (settings.autoLock && settings.autoLock.screenLockEnabled === undefined) {
          settings.autoLock.screenLockEnabled = true;
          await this.updateSecuritySettings(settings);
        }
        return settings;
      }

      // Default settings — new installs load read-only with no wall (screenLockEnabled: false).
      const defaultSettings: SecuritySettings = {
        autoLock: {
          enabled: true,
          timeout: 300000, // 5 minutes
          biometricUnlock: false,
          requirePasswordAfterTimeout: true,
          screenLockEnabled: false,
        },
        biometric: {
          enabled: false,
          requireForTransactions: false,
          requireForExports: true,
        },
        auditLog: {
          enabled: true,
          retentionDays: 30,
          maxEntries: 1000,
        },
      };

      await this.updateSecuritySettings(defaultSettings);
      return defaultSettings;
    } catch (error) {
      securityLogger.error('Failed to get security settings:', error); // Return safe defaults if storage fails
      return {
        autoLock: {
          enabled: false,
          timeout: 300000,
          biometricUnlock: false,
          requirePasswordAfterTimeout: true,
          screenLockEnabled: false,
        },
        biometric: {
          enabled: false,
          requireForTransactions: false,
          requireForExports: false,
        },
        auditLog: {
          enabled: false,
          retentionDays: 30,
          maxEntries: 1000,
        },
      };
    }
  }

  async updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<void> {
    try {
      const defaults = {
        autoLock: {
          enabled: true,
          timeout: 300000, // 5 minutes
          biometricUnlock: false,
          requirePasswordAfterTimeout: true,
          screenLockEnabled: false,
        },
        biometric: {
          enabled: false,
          requireForTransactions: false,
          requireForExports: true,
        },
        auditLog: {
          enabled: true,
          retentionDays: 30,
          maxEntries: 1000,
        },
        terms: {
          accepted: false,
          version: '1.0.0',
          timestamp: 0,
        },
      };

      // Merge inside a single transaction so a concurrent settings write — e.g. a watched-address
      // save landing at the same moment — cannot read stale settings and clobber this change, or
      // be clobbered by it. Capture the before/after here for the side effects below.
      let currentSettings: any = defaults;
      let newSettings: any = defaults;
      await StorageService.mutateSettings((all) => {
        currentSettings = all?.security_settings || defaults;
        newSettings = { ...currentSettings, ...settings };
        return { ...all, security_settings: newSettings };
      });

      // Track if biometric settings are changing
      const biometricStatusChanged =
        settings.biometric &&
        settings.biometric.enabled !== undefined &&
        settings.biometric.enabled !== currentSettings.biometric.enabled;

      await this.logSecurityEvent('settings_change', 'Security settings updated', true);

      // If biometric settings changed, update the standalone biometric setting
      if (biometricStatusChanged) {
        await StorageService.setBiometricEnabled(newSettings.biometric.enabled);

        // If biometrics were disabled, clear all biometric data
        if (!newSettings.biometric.enabled) {
          // Clear all biometric credentials and encrypted passwords
          await StorageService.removeBiometricCredential();
          await StorageService.removeEncryptedWalletPassword();
        }

        // Notify other components of this change
        if (isBrowser()) {
          const event = new CustomEvent('security-settings-changed', {
            detail: { biometric: newSettings.biometric },
          });
          window.dispatchEvent(event);
        }
      }

      // Apply new auto-lock settings
      if (settings.autoLock) {
        if (newSettings.autoLock.enabled) {
          this.setupAutoLock(newSettings.autoLock);
        } else {
          this.clearAutoLock();
        }
      }
    } catch (error) {
      securityLogger.error('Failed to update security settings:', error);
      throw error;
    }
  }

  // State getters
  getSecurityState(): SecurityState {
    return { ...this.securityState };
  }

  async isLocked(): Promise<boolean> {
    await this.ensureInitialized();

    // Check if there's an active wallet (consistent with initialization logic)
    const activeWallet = await StorageService.getActiveWallet();
    if (!activeWallet) {
      // If no active wallet, we should never be locked
      if (this.securityState.isLocked) {
        this.securityState.isLocked = false;
        this.notifyLockStateChange(false);
      }
      return false;
    }

    return this.securityState.isLocked;
  }

  // Synchronous version for backwards compatibility (but should be avoided)
  isLockedSync(): boolean {
    // Note: This sync version can't check wallet existence
    // This is only used in contexts where immediate response is needed
    return this.securityState.isLocked;
  }

  // Event listeners
  onLockStateChange(
    callback: (isLocked: boolean, reason?: 'timeout' | 'manual' | 'failed_auth') => void,
  ) {
    this.lockStateListeners.push(callback);
    return () => {
      const index = this.lockStateListeners.indexOf(callback);
      if (index > -1) {
        this.lockStateListeners.splice(index, 1);
      }
    };
  }

  private notifyLockStateChange(isLocked: boolean) {
    this.lockStateListeners.forEach((callback) =>
      callback(isLocked, this.securityState.lockReason),
    );
  }

  // Cleanup
  destroy() {
    this.clearAutoLock();
    this.lockStateListeners = [];
    this.activityListeners = [];
  }

  // Rate limiting and lockout methods
  isLockedOut(): boolean {
    if (this.failedAttempts < this.MAX_FAILED_ATTEMPTS) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailedAttempt;
    return timeSinceLastFailure < this.LOCKOUT_DURATION;
  }

  getRemainingLockoutTime(): number {
    if (!this.isLockedOut()) {
      return 0;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailedAttempt;
    return Math.max(0, this.LOCKOUT_DURATION - timeSinceLastFailure);
  }

  recordFailedAttempt(): void {
    this.failedAttempts++;
    this.lastFailedAttempt = Date.now();

    // Persist failed attempts to localStorage to survive page refreshes (browser only)
    if (isBrowser()) {
      try {
        localStorage.setItem('security_failed_attempts', this.failedAttempts.toString());
        localStorage.setItem('security_last_failed_attempt', this.lastFailedAttempt.toString());
      } catch (error) {
        securityLogger.error('Failed to persist security state:', error);
      }
    }
  }

  resetFailedAttempts(): void {
    this.failedAttempts = 0;
    this.lastFailedAttempt = 0;

    // Clear from localStorage (browser only)
    if (isBrowser()) {
      try {
        localStorage.removeItem('security_failed_attempts');
        localStorage.removeItem('security_last_failed_attempt');
      } catch (error) {
        securityLogger.error('Failed to clear security state:', error);
      }
    }
  }

  // Load failed attempts from localStorage on service initialization
  private loadFailedAttemptsFromStorage(): void {
    // Only access localStorage in browser environment
    if (!isBrowser()) {
      return;
    }

    try {
      const storedFailedAttempts = localStorage.getItem('security_failed_attempts');
      const storedLastFailedAttempt = localStorage.getItem('security_last_failed_attempt');

      if (storedFailedAttempts && storedLastFailedAttempt) {
        this.failedAttempts = parseInt(storedFailedAttempts, 10) || 0;
        this.lastFailedAttempt = parseInt(storedLastFailedAttempt, 10) || 0;

        // If the lockout period has expired, reset the failed attempts
        if (!this.isLockedOut() && this.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
          this.resetFailedAttempts();
        }
      }
    } catch (error) {
      securityLogger.error('Failed to load security state from storage:', error);
      this.resetFailedAttempts();
    }
  }
  async disableBiometricAuth(walletAddress?: string): Promise<boolean> {
    try {
      // Check if biometrics are enabled before trying to disable
      const isEnabled = await StorageService.isBiometricEnabled();
      if (!isEnabled) {
        return true; // Already disabled
      }

      if (walletAddress) {
        // Disable biometrics for a specific wallet only
        await StorageService.removeEncryptedWalletPassword(walletAddress);

        // Also remove the wallet-specific credential
        await StorageService.removeBiometricCredential(walletAddress);

        await this.logSecurityEvent(
          'biometric_setup',
          `Biometric authentication disabled for wallet: ${walletAddress}`,
          true,
        );
      } else {
        // Get the active wallet if no address specified
        try {
          const activeWallet = await StorageService.getActiveWallet();
          if (activeWallet) {
            walletAddress = activeWallet.address;
            await StorageService.removeEncryptedWalletPassword(walletAddress);
            await StorageService.removeBiometricCredential(walletAddress);
          }
        } catch (err) {
          securityLogger.warn('Could not get active wallet for biometric disable:', err); // Continue with global disable
        }

        // Global disable (all wallets) as fallback or if requested
        if (!walletAddress) {
          // Remove biometric credential for all wallets
          await StorageService.removeBiometricCredential();

          // Remove stored encrypted passwords for all wallets
          await StorageService.removeEncryptedWalletPassword();

          // Disable biometric authentication globally
          await StorageService.setBiometricEnabled(false);

          // Notify all components about this global change
          if (isBrowser()) {
            const event = new CustomEvent('security-settings-changed', {
              detail: { biometric: { enabled: false } },
            });
            window.dispatchEvent(event);
          }
        }

        await this.logSecurityEvent(
          'biometric_setup',
          'Biometric authentication disabled by user',
          true,
        );
      }

      return true;
    } catch (error) {
      securityLogger.error('Error disabling biometric authentication:', error);
      await this.logSecurityEvent(
        'biometric_setup',
        `Failed to disable biometric authentication: ${error}`,
        false,
      );
      return false;
    }
  }

  /**
   * Checks if biometric authentication is available on this device
   * and enabled in the security settings
   */
  async isBiometricAuthAvailable(): Promise<boolean> {
    try {
      // First check if the device supports biometrics
      const isHardwareSupported = await this.checkBiometricSupport();

      if (!isHardwareSupported) {
        return false;
      }

      // Then check if biometrics are enabled in global security settings
      const globalBiometricsEnabled = await StorageService.isBiometricEnabled();

      if (!globalBiometricsEnabled) {
        return false;
      }

      // Finally check if biometrics are enabled for the active wallet
      const activeWallet = await StorageService.getActiveWallet();

      return activeWallet?.biometricsEnabled === true;
    } catch (error) {
      securityLogger.error('Error checking biometric availability:', error);
      return false;
    }
  }

  /**
   * Checks if a specific wallet has biometrics enabled
   * @param walletAddress The wallet address to check, or uses active wallet if not provided
   */
  async isWalletBiometricEnabled(walletAddress?: string): Promise<boolean> {
    try {
      // Get the wallet to check
      let wallet;
      if (walletAddress) {
        wallet = await StorageService.getWalletByAddress(walletAddress);
      } else {
        wallet = await StorageService.getActiveWallet();
      }

      if (!wallet) {
        return false;
      }

      // Check if the wallet has biometrics properly set up
      return (
        wallet.biometricsEnabled === true &&
        Array.isArray(wallet.biometricCredentialId) &&
        wallet.biometricCredentialId.length > 0
      );
    } catch (error) {
      securityLogger.error('Error checking wallet biometric status:', error);
      return false;
    }
  }

  /**
   * Checks if biometrics can be set up for a wallet
   * @param walletAddress The wallet address to check, or uses active wallet if not provided
   */
  async canSetupBiometrics(walletAddress?: string): Promise<{
    canSetup: boolean;
    reason?: string;
    requiresPassword: boolean;
  }> {
    try {
      // Check hardware support first
      const isHardwareSupported = await this.checkBiometricSupport();
      if (!isHardwareSupported) {
        return {
          canSetup: false,
          reason: 'Device does not support biometric authentication',
          requiresPassword: false,
        };
      }

      // Check global settings
      const settings = await this.getSecuritySettings();
      if (!settings.biometric.enabled) {
        return {
          canSetup: false,
          reason: 'Biometrics are disabled in security settings',
          requiresPassword: false,
        };
      }

      // Get the wallet to check
      let wallet;
      if (walletAddress) {
        wallet = await StorageService.getWalletByAddress(walletAddress);
      } else {
        wallet = await StorageService.getActiveWallet();
      }

      if (!wallet) {
        return {
          canSetup: false,
          reason: 'No wallet found',
          requiresPassword: false,
        };
      }

      // If wallet is already set up with biometrics, inform the caller
      if (
        wallet.biometricsEnabled === true &&
        Array.isArray(wallet.biometricCredentialId) &&
        wallet.biometricCredentialId.length > 0
      ) {
        return {
          canSetup: false,
          reason: 'Biometrics already set up for this wallet',
          requiresPassword: false,
        };
      }

      // Wallet exists and can have biometrics set up
      // If wallet is encrypted, we'll need a password
      return {
        canSetup: true,
        requiresPassword: wallet.isEncrypted === true,
      };
    } catch (error) {
      securityLogger.error('Error checking biometric setup capability:', error);
      return {
        canSetup: false,
        reason: `Error: ${error}`,
        requiresPassword: false,
      };
    }
  }

  /**
   * Quick setup for wallet biometrics with a simplified interface
   * @param password Wallet password if the wallet is encrypted
   * @param walletAddress Specific wallet address or uses active wallet if not provided
   */
  async quickSetupBiometrics(
    password?: string,
    walletAddress?: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Check if setup is possible
      const setupCheck = await this.canSetupBiometrics(walletAddress);

      if (!setupCheck.canSetup) {
        return {
          success: false,
          message: setupCheck.reason || 'Cannot setup biometrics',
        };
      }

      // If wallet requires password but none provided
      if (setupCheck.requiresPassword && !password) {
        return {
          success: false,
          message: 'This wallet is encrypted. Please provide a password.',
        };
      }

      // Get the target wallet
      let wallet;
      if (walletAddress) {
        wallet = await StorageService.getWalletByAddress(walletAddress);
      } else {
        wallet = await StorageService.getActiveWallet();
      }

      if (!wallet) {
        return {
          success: false,
          message: 'No wallet found',
        };
      }

      // If encrypted, validate password first
      if (wallet.isEncrypted) {
        const isPasswordValid = await this.validateWalletPassword(wallet.privateKey, password!);
        if (!isPasswordValid) {
          await this.logSecurityEvent(
            'biometric_setup',
            'Biometric setup failed: Invalid password',
            false,
          );
          return {
            success: false,
            message: 'Invalid wallet password',
          };
        }
      }

      // Generate user ID from wallet
      const userId = `wallet-${wallet.address.slice(-8)}`;

      // Set up biometrics
      const success = await this.setupBiometricAuth(
        userId,
        wallet.isEncrypted ? password : undefined,
      );

      if (success) {
        return {
          success: true,
          message: 'Biometric authentication successfully set up',
        };
      } else {
        return {
          success: false,
          message: 'Failed to set up biometric authentication',
        };
      }
    } catch (error) {
      securityLogger.error('Error in quick biometric setup:', error);
      return {
        success: false,
        message: `Error: ${error}`,
      };
    }
  }
}

export const securityService = SecurityService.getInstance();
