import * as CryptoJS from 'crypto-js';
import packageJson from '../../../package.json';
import { StorageService } from './StorageService';
import {
  WalletBackup,
  BackupWallet,
  BackupAddress,
  BackupSettings,
  BackupMetadata,
  RestoreOptions,
  BackupValidationResult,
} from '@/types/backup';
import { toast } from 'sonner';
import { secureEncrypt, decryptData } from '../wallet/WalletService';
import { Logger } from '@/lib/Logger';

export class BackupService {
  private static readonly CURRENT_VERSION = '1.0.0';
  private static readonly BACKUP_MAGIC_HEADER = 'AVIAN_WALLET_BACKUP';
  private static readonly QR_CHUNK_HEADER = 'AVIAN_QR_CHUNK';
  private static readonly MAX_QR_CHUNK_SIZE = 800; // Much smaller for reliable mobile scanning
  private static readonly backupLogger = Logger.getLogger('backup_service');

  /**
   * Create a full backup of all wallet data
   *
   * Note about biometric data:
   * - Actual biometric credentials (biometricWalletPasswords, biometricCredentialId,
   *   biometricWalletCredentials) are NOT included in backups as they are device-specific
   * - Only information about WHICH wallets had biometrics enabled is backed up
   * - Users will need to set up biometrics again after restoring on a new device
   */
  static async createFullBackup(password?: string): Promise<WalletBackup> {
    try {
      this.backupLogger.debug('Creating full backup', { passwordProvided: !!password });

      // Get all wallets
      const wallets = await StorageService.getAllWallets();
      // Note: The actual biometric credentials cannot be transferred between devices
      const backupWallets: BackupWallet[] = [];
      for (const wallet of wallets) {
        let biometricEnabled = false;
        try {
          if (wallet.address) {
            biometricEnabled = await StorageService.isBiometricEnabledForWallet(wallet.address);
          }
        } catch (biometricError) {
          toast.error('Failed to check biometric status for wallet', {
            description: `Could not determine biometric status for wallet ${wallet.name}.`,
          });
        }

        backupWallets.push({
          id: wallet.id || 0,
          name: wallet.name,
          address: wallet.address,
          privateKey: wallet.privateKey,
          mnemonic: wallet.mnemonic,
          isEncrypted: wallet.isEncrypted,
          isActive: wallet.isActive,
          createdAt: wallet.createdAt ? new Date(wallet.createdAt).getTime() : Date.now(),
          lastAccessed: wallet.lastAccessed ? new Date(wallet.lastAccessed).getTime() : Date.now(),
          biometricEnabled, // Only used for informational purposes about which wallets had biometrics
          descriptor: wallet.descriptor,
          xprv: wallet.xprv,
        });
      }

      // Get address book
      const addressBook = await StorageService.getSavedAddresses();
      const backupAddresses: BackupAddress[] = addressBook.map((addr: any) => ({
        id: addr.id,
        name: addr.name,
        address: addr.address,
        note: addr.description,
        lastUsed: addr.lastUsed ? new Date(addr.lastUsed).getTime() : undefined,
        timesUsed: addr.useCount || 0,
        createdAt: addr.dateAdded ? new Date(addr.dateAdded).getTime() : Date.now(),
      }));

      // Get security settings
      const allSettings = (await StorageService.getSettings()) || {};
      const securitySettings = allSettings.security_settings || {};

      // Get settings
      const settings: BackupSettings = {
        theme: localStorage.getItem('theme') || 'system',
        currency: localStorage.getItem('currency') || 'USD',
        notifications: localStorage.getItem('notifications') !== 'false',
        autoLock: localStorage.getItem('autoLock') === 'true',
        lockTimeout: parseInt(localStorage.getItem('lockTimeout') || '300000'),
        securitySettings: {
          biometric: {
            enabled: securitySettings?.biometric?.enabled || false,
            requireForTransactions: securitySettings?.biometric?.requireForTransactions || false,
            requireForExports: securitySettings?.biometric?.requireForExports || true,
          },
          auditLog: {
            enabled: securitySettings?.auditLog?.enabled || true,
            retentionDays: securitySettings?.auditLog?.retentionDays || 30,
            maxEntries: securitySettings?.auditLog?.maxEntries || 1000,
          },
        },
        preferences: allSettings.preferences || {},
      };

      // Get transaction history
      const transactions = await StorageService.getTransactionHistory();
      const backupTransactions = transactions.map((tx) => {
        // Handle timestamp conversions safely
        let timestamp: number;
        if (tx.timestamp instanceof Date) {
          timestamp = tx.timestamp.getTime();
        } else if (typeof tx.timestamp === 'number') {
          timestamp = tx.timestamp;
        } else {
          timestamp = Date.now(); // Fallback
        }

        return {
          txid: tx.txid,
          amount: tx.amount,
          address: tx.address,
          fromAddress: tx.fromAddress,
          type: tx.type as 'send' | 'receive',
          timestamp,
          confirmations: tx.confirmations || 0,
          blockHeight: tx.blockHeight,
        };
      });

      // Get watched addresses
      const { default: WatchAddressService } = await import(
        '@/services/wallet/WatchAddressService'
      );
      const watchedAddresses = await WatchAddressService.getAllWatchedAddresses();
      const backupWatchedAddresses = watchedAddresses.map((addr) => ({
        user_wallet_address: addr.user_wallet_address,
        watch_address: addr.watch_address,
        label: addr.label,
        notification_types: addr.notification_types,
        created_at: addr.created_at ? new Date(addr.created_at).getTime() : Date.now(),
        balance: addr.balance,
        script_hash: addr.script_hash,
      }));

      // Get security audit log
      const auditLog = allSettings.security_audit_log || [];
      const backupAuditLog = auditLog.map((entry: any) => {
        // Ensure each field has a fallback value if missing
        return {
          id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          timestamp: entry.timestamp || Date.now(),
          action: entry.action || 'unknown',
          details: entry.details || '',
          success: typeof entry.success === 'boolean' ? entry.success : true,
          walletAddress: entry.walletAddress || '',
        };
      });

      // Create metadata
      const metadata: BackupMetadata = {
        appVersion: packageJson.version,
        platform: typeof window !== 'undefined' ? window.navigator.platform : 'unknown',
        deviceInfo: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
        backupType: 'full',
      };

      const backup: WalletBackup = {
        version: this.CURRENT_VERSION,
        timestamp: Date.now(),
        wallets: backupWallets,
        addressBook: backupAddresses,
        settings,
        metadata,
        transactions: backupTransactions,
        auditLog: backupAuditLog,
        watchedAddresses: backupWatchedAddresses,
      };

      this.backupLogger.debug('Full backup created successfully', {
        walletsCount: backupWallets.length,
        addressesCount: backupAddresses.length,
        transactionsCount: backupTransactions.length,
        watchedAddressesCount: backupWatchedAddresses.length,
      });
      return backup;
    } catch (error) {
      this.backupLogger.error('Failed to create backup', error);
      throw new Error('Failed to create backup');
    }
  }

  /**
   * Export backup as encrypted JSON file
   */
  static async exportBackup(backup: WalletBackup, password?: string): Promise<Blob> {
    try {
      this.backupLogger.debug('Exporting backup', { passwordProtected: !!password });

      let backupData = JSON.stringify(backup, null, 2);

      if (password) {
        // Encrypt the backup data
        backupData = await secureEncrypt(backupData, password);
        this.backupLogger.debug('Backup encrypted successfully');
      }

      // Add magic header for file identification
      const fileContent = `${this.BACKUP_MAGIC_HEADER}\n${backupData}`;

      return new Blob([fileContent], { type: 'application/json' });
    } catch (error) {
      this.backupLogger.error('Failed to export backup', error);
      throw new Error('Failed to export backup');
    }
  }

  /**
   * Download backup file
   */
  static downloadBackup(blob: Blob, filename?: string): void {
    this.backupLogger.debug('Downloading backup file', { size: blob.size });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      filename || `avian-wallet-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Parse and validate backup file
   */
  static async parseBackupFile(
    file: File,
    password?: string,
  ): Promise<{ backup: WalletBackup; validation: BackupValidationResult }> {
    try {
      this.backupLogger.debug('Parsing backup file', {
        fileName: file.name,
        fileSize: file.size,
        passwordProvided: !!password,
      });

      const fileContent = await file.text();

      // Check for magic header
      if (!fileContent.startsWith(this.BACKUP_MAGIC_HEADER)) {
        this.backupLogger.warn('Invalid backup file format - missing magic header');
        throw new Error('Invalid backup file format');
      }

      // Remove magic header
      let backupData = fileContent.replace(`${this.BACKUP_MAGIC_HEADER}\n`, '');

      // Check if the data appears to be encrypted (if it doesn't start with '{' it's likely encrypted)
      const isEncrypted = !backupData.trim().startsWith('{');

      if (isEncrypted && !password) {
        throw new Error('ENCRYPTED_BACKUP_NO_PASSWORD');
      }

      // Try to decrypt if password provided or if data appears encrypted
      if (password || isEncrypted) {
        try {
          const { decrypted } = await decryptData(backupData, password || '');
          if (!decrypted) {
            throw new Error('Invalid password');
          }
          backupData = decrypted;
        } catch (decryptError) {
          throw new Error('Failed to decrypt backup - invalid password');
        }
      }

      // Parse JSON
      const backup: WalletBackup = JSON.parse(backupData);

      // Validate backup
      const validation = this.validateBackup(backup);

      this.backupLogger.debug('Backup file parsed successfully', {
        version: backup.version,
        walletsCount: backup.wallets.length,
        isValid: validation.isValid,
      });

      return { backup, validation };
    } catch (error) {
      if (error instanceof Error && error.message === 'ENCRYPTED_BACKUP_NO_PASSWORD') {
        this.backupLogger.debug('Encrypted backup detected but no password provided');
        throw new Error('This backup file is encrypted. Please provide a password to decrypt it.');
      }

      this.backupLogger.error('Failed to parse backup file', error);
      throw new Error(
        `Failed to parse backup file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Validate backup structure and data
   */
  static validateBackup(backup: any): BackupValidationResult {
    this.backupLogger.debug('Validating backup structure');
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!backup.version) errors.push('Missing backup version');
    if (!backup.timestamp) errors.push('Missing backup timestamp');
    if (!backup.wallets) errors.push('Missing wallets data');
    if (!backup.metadata) errors.push('Missing metadata');

    // Check version compatibility
    if (backup.version !== this.CURRENT_VERSION) {
      warnings.push(
        `Backup version ${backup.version} may not be fully compatible with current version ${this.CURRENT_VERSION}`,
      );
    }

    // Validate wallets
    let walletsCount = 0;
    let hasEncryptedData = false;

    if (Array.isArray(backup.wallets)) {
      walletsCount = backup.wallets.length;

      backup.wallets.forEach((wallet: any, index: number) => {
        if (!wallet.address) errors.push(`Wallet ${index + 1}: Missing address`);
        if (!wallet.privateKey) errors.push(`Wallet ${index + 1}: Missing private key`);
        if (wallet.isEncrypted) hasEncryptedData = true;
      });
    }

    // Validate address book
    let addressesCount = 0;
    if (Array.isArray(backup.addressBook)) {
      addressesCount = backup.addressBook.length;
    }

    // Validate transaction history
    let transactionsCount = 0;
    if (Array.isArray(backup.transactions)) {
      transactionsCount = backup.transactions.length;
    }

    // Validate security audit log
    let auditLogCount = 0;
    if (Array.isArray(backup.auditLog)) {
      auditLogCount = backup.auditLog.length;
    }

    // Validate watched addresses
    let watchedAddressesCount = 0;
    if (Array.isArray(backup.watchedAddresses)) {
      watchedAddressesCount = backup.watchedAddresses.length;
    }

    // Check timestamp validity
    if (backup.timestamp && backup.timestamp > Date.now()) {
      warnings.push('Backup timestamp is in the future');
    }

    const result = {
      isValid: errors.length === 0,
      version: backup.version || 'unknown',
      walletsCount,
      addressesCount,
      hasEncryptedData,
      errors,
      warnings,
      transactionsCount,
      auditLogCount,
      watchedAddressesCount,
    };

    if (errors.length > 0) {
      this.backupLogger.warn('Backup validation failed with errors', { errors });
    } else if (warnings.length > 0) {
      this.backupLogger.debug('Backup validation passed with warnings', { warnings });
    } else {
      this.backupLogger.debug('Backup validation passed successfully');
    }

    return result;
  }

  /**
   * Restore from backup
   */
  static async restoreFromBackup(
    backup: WalletBackup,
    options: RestoreOptions,
    onProgress?: (step: string, progress: number) => void,
  ): Promise<void> {
    try {
      this.backupLogger.debug('Starting backup restore', {
        options,
        backupVersion: backup.version,
        walletsCount: backup.wallets.length,
      });

      let totalSteps = 0;
      let currentStep = 0;

      // Count total steps
      if (options.includeWallets && backup.wallets.length > 0) totalSteps++;
      if (options.includeAddressBook && backup.addressBook.length > 0) totalSteps++;
      if (options.includeSettings) totalSteps++;
      if (options.includeTransactions && backup.transactions && backup.transactions.length > 0)
        totalSteps++;
      if (options.includeSecurityAudit && backup.auditLog && backup.auditLog.length > 0)
        totalSteps++;
      if (
        options.includeWatchedAddresses &&
        backup.watchedAddresses &&
        backup.watchedAddresses.length > 0
      )
        totalSteps++;

      // Restore wallets
      if (options.includeWallets && backup.wallets.length > 0) {
        onProgress?.('Restoring wallets...', (currentStep / totalSteps) * 100);
        this.backupLogger.debug('Restoring wallets', { count: backup.wallets.length });

        for (const wallet of backup.wallets) {
          // Check if wallet already exists
          if (!options.overwriteExisting && (await StorageService.walletExists(wallet.address))) {
            this.backupLogger.debug('Skipping existing wallet', {
              address: wallet.address.substring(0, 5) + '...',
              name: wallet.name,
            });
            continue;
          }

          // Create or update wallet
          await StorageService.createWallet({
            name: wallet.name,
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic,
            isEncrypted: wallet.isEncrypted,
            makeActive: wallet.isActive,
            ...(wallet.descriptor !== undefined && { descriptor: wallet.descriptor }),
            ...(wallet.xprv !== undefined && { xprv: wallet.xprv }),
          });
          this.backupLogger.debug('Restored wallet', {
            name: wallet.name,
            isEncrypted: wallet.isEncrypted,
            hasMnemonic: !!wallet.mnemonic,
          });
        }
        currentStep++;
      }

      // Restore address book
      if (options.includeAddressBook && backup.addressBook.length > 0) {
        onProgress?.('Restoring address book...', (currentStep / totalSteps) * 100);

        for (const address of backup.addressBook) {
          await StorageService.saveAddress({
            id: address.id,
            name: address.name,
            address: address.address,
            description: address.note,
            dateAdded: new Date(address.createdAt),
            lastUsed: address.lastUsed ? new Date(address.lastUsed) : undefined,
            useCount: address.timesUsed,
          });
        }
        currentStep++;
      }

      // Restore settings
      if (options.includeSettings) {
        onProgress?.('Restoring settings...', (currentStep / totalSteps) * 100);

        if (backup.settings.theme) {
          localStorage.setItem('theme', backup.settings.theme);
        }
        if (backup.settings.currency) {
          localStorage.setItem('currency', backup.settings.currency);
        }
        localStorage.setItem('notifications', backup.settings.notifications.toString());
        localStorage.setItem('autoLock', backup.settings.autoLock.toString());
        localStorage.setItem('lockTimeout', backup.settings.lockTimeout.toString());

        // Restore security settings if available
        if (backup.settings.securitySettings) {
          const allSettings = (await StorageService.getSettings()) || {};
          allSettings.security_settings = {
            biometric: backup.settings.securitySettings.biometric,
            auditLog: backup.settings.securitySettings.auditLog,
            autoLock: {
              enabled: backup.settings.autoLock,
              timeout: backup.settings.lockTimeout,
              biometricUnlock: backup.settings.securitySettings.biometric.enabled,
              requirePasswordAfterTimeout: true,
            },
          };
          await StorageService.setSettings(allSettings);
        }

        // We can't directly restore preferences as the method is private
        // The important preferences are already handled via specific settings
        currentStep++;
      }

      // Restore transaction history
      if (options.includeTransactions && backup.transactions && backup.transactions.length > 0) {
        onProgress?.('Restoring transaction history...', (currentStep / totalSteps) * 100);

        // Clear existing transactions if overwriteExisting is true
        if (options.overwriteExisting) {
          await StorageService.clearTransactionHistory();
        }

        for (const tx of backup.transactions) {
          await StorageService.saveTransaction({
            txid: tx.txid,
            amount: tx.amount,
            walletAddress: tx.address,
            address: tx.address,
            fromAddress: tx.fromAddress,
            type: tx.type,
            timestamp: new Date(tx.timestamp),
            confirmations: tx.confirmations,
            blockHeight: tx.blockHeight,
          });
        }
        currentStep++;
      }

      // Restore security audit log
      if (options.includeSecurityAudit && backup.auditLog && backup.auditLog.length > 0) {
        onProgress?.('Restoring security audit log...', (currentStep / totalSteps) * 100);

        const settings = (await StorageService.getSettings()) || {};
        settings.security_audit_log = backup.auditLog.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          details: entry.details,
          success: entry.success,
          walletAddress: entry.walletAddress,
        }));
        await StorageService.setSettings(settings);
        currentStep++;
      }

      // Restore watched addresses
      if (
        options.includeWatchedAddresses &&
        backup.watchedAddresses &&
        backup.watchedAddresses.length > 0
      ) {
        onProgress?.('Restoring watched addresses...', (currentStep / totalSteps) * 100);

        const { default: WatchAddressService } = await import(
          '@/services/wallet/WatchAddressService'
        );

        // Get all current wallets to use as possible owners for the watched addresses
        const allWallets = await StorageService.getAllWallets();
        // Use the first wallet or a placeholder if no wallets exist
        const defaultWalletAddress =
          allWallets.length > 0 ? allWallets[0].address : 'global_watch_placeholder';

        for (const watchedAddr of backup.watchedAddresses) {
          try {
            // Determine which wallet to associate the watched address with
            // If the original wallet doesn't exist, use the default wallet
            let ownerWalletAddress = watchedAddr.user_wallet_address;

            // Add each watched address to the service without checking if wallet exists
            // This treats watched addresses as truly global entities
            await WatchAddressService.addWatchAddress(
              ownerWalletAddress || defaultWalletAddress,
              watchedAddr.watch_address,
              watchedAddr.label,
            );

            // Update notification types if present
            if (watchedAddr.notification_types && watchedAddr.notification_types.length > 0) {
              await WatchAddressService.updateWatchAddressNotifications(
                ownerWalletAddress || defaultWalletAddress,
                watchedAddr.watch_address,
                watchedAddr.notification_types,
              );
            }
          } catch (error) {
            // Continue with next address if one fails
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast.error(`Failed to restore watched address ${watchedAddr.watch_address}`, {
              description: errorMessage,
            });
          }
        }
        currentStep++;
      }

      // Handle biometric information
      if (options.includeWallets && backup.wallets.length > 0) {
        // Create an array of wallets that had biometrics enabled in the backup
        const walletsWithBiometrics = backup.wallets
          .filter((wallet) => wallet.biometricEnabled)
          .map((wallet) => wallet.name);

        // Store this information in settings for possible notification to the user
        if (walletsWithBiometrics.length > 0) {
          const allSettings = (await StorageService.getSettings()) || {};
          allSettings.wallets_needing_biometric_setup = walletsWithBiometrics;
          await StorageService.setSettings(allSettings);
        }

        // IMPORTANT: We deliberately do NOT restore any of these biometric-specific items:
        // - biometricWalletPasswords (contains encrypted passwords unlocked by biometrics)
        // - biometricWalletCredentials (contains device-specific credential IDs)
        // - biometricCredentialId (legacy device-specific identifier)
        // - biometricWalletAddress (references specific wallet with biometrics)
        //
        // These are all device-specific and won't function correctly on a different device.
        // Users will need to set up biometrics again on the new device.
      }

      onProgress?.('Restore completed!', 100);
      this.backupLogger.debug('Backup restoration completed successfully');
    } catch (error) {
      this.backupLogger.error('Failed to restore backup', error);
      throw new Error(
        `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Create wallets-only backup (for security-focused users)
   */
  static async createWalletsOnlyBackup(password?: string): Promise<WalletBackup> {
    this.backupLogger.debug('Creating wallets-only backup', { passwordProvided: !!password });
    const fullBackup = await this.createFullBackup(password);

    return {
      ...fullBackup,
      addressBook: [], // Empty address book for security
      settings: {
        theme: 'system',
        currency: 'USD',
        notifications: true,
        autoLock: false,
        lockTimeout: 300000,
        securitySettings: fullBackup.settings.securitySettings, // Preserve security settings
      },
      transactions: [], // No transaction history for security
      auditLog: [], // No audit log for security
      watchedAddresses: [], // No watched addresses for security
      metadata: {
        ...fullBackup.metadata,
        backupType: 'wallets-only',
      },
    };
    this.backupLogger.debug('Wallets-only backup created');
  }

  /**
   * Verify backup integrity
   */
  static async verifyBackupIntegrity(backup: WalletBackup): Promise<boolean> {
    try {
      this.backupLogger.debug('Verifying backup integrity');
      // Check if all wallets have valid addresses and private keys
      for (const wallet of backup.wallets) {
        if (!wallet.address || !wallet.privateKey) {
          this.backupLogger.warn('Backup integrity check failed - invalid wallet data', {
            walletName: wallet.name,
            hasAddress: !!wallet.address,
            hasPrivateKey: !!wallet.privateKey,
          });
          return false;
        }

        // Additional validation could include:
        // - Verify private key format
        // - Verify address derives from private key
        // - Check mnemonic validity if present
      }

      this.backupLogger.debug('Backup integrity check passed');
      return true;
    } catch (error) {
      this.backupLogger.error('Error during backup integrity verification', error);
      return false;
    }
  }

  /**
   * Get backup summary for display
   */
  static getBackupSummary(backup: WalletBackup): {
    version: string;
    date: string;
    walletsCount: number;
    addressesCount: number;
    hasEncryptedWallets: boolean;
    transactionsCount: number;
    hasAuditLog: boolean;
    hasBiometricData: boolean;
    backupType: string;
    hdWalletsCount: number;
    walletNames: string[];
    watchedAddressesCount: number;
  } {
    const encryptedWallets = backup.wallets.filter((w) => w.isEncrypted);
    const walletsWithBiometrics = backup.wallets.filter((w) => w.biometricEnabled);
    const hdWallets = backup.wallets.filter((w) => w.mnemonic);
    const walletNames = backup.wallets.map((w) => w.name);

    // Get names of wallets that had biometrics for display purposes
    let biometricInfo = '';
    if (walletsWithBiometrics.length > 0) {
      const walletNames = walletsWithBiometrics.map((w) => w.name).join(', ');
      biometricInfo = `Wallets with biometrics: ${walletNames} (requires setup after restore)`;
    }

    return {
      version: backup.version,
      date: new Date(backup.timestamp).toLocaleDateString(),
      walletsCount: backup.wallets.length,
      addressesCount: backup.addressBook.length,
      hasEncryptedWallets: encryptedWallets.length > 0,
      transactionsCount: backup.transactions?.length || 0,
      hasAuditLog: (backup.auditLog?.length || 0) > 0,
      hasBiometricData: walletsWithBiometrics.length > 0,
      backupType: backup.metadata.backupType,
      hdWalletsCount: hdWallets.length,
      walletNames: walletNames,
      watchedAddressesCount: backup.watchedAddresses?.length || 0,
    };
  }

  /**
   * Get wallets that need biometric setup after restore
   * This helps the UI inform users which wallets previously had biometrics enabled
   * in the backup but need to be set up again on the new device
   */
  static async getWalletsNeedingBiometricSetup(): Promise<string[]> {
    try {
      const settings = (await StorageService.getSettings()) || {};
      const wallets = settings.wallets_needing_biometric_setup || [];
      this.backupLogger.debug('Retrieved wallets needing biometric setup', {
        count: wallets.length,
      });
      return wallets;
    } catch (error) {
      this.backupLogger.error('Error getting wallets needing biometric setup', error);
      return [];
    }
  }

  /**
   * Clear the list of wallets needing biometric setup
   * Call this after a wallet has had its biometrics set up again
   */
  static async clearWalletNeedingBiometricSetup(walletName: string): Promise<void> {
    try {
      this.backupLogger.debug('Clearing wallet from biometric setup list', { walletName });
      const settings = (await StorageService.getSettings()) || {};
      const walletsList = settings.wallets_needing_biometric_setup || [];

      if (walletsList.includes(walletName)) {
        settings.wallets_needing_biometric_setup = walletsList.filter(
          (name: string) => name !== walletName,
        );
        await StorageService.setSettings(settings);
        this.backupLogger.debug('Wallet removed from biometric setup list', { walletName });
      } else {
        this.backupLogger.debug('Wallet not found in biometric setup list', { walletName });
      }
    } catch (error) {
      this.backupLogger.error('Failed to clear wallet from biometric setup list', {
        walletName,
        error,
      });
      toast.error('Failed to clear wallet from biometric setup list', {
        description: `Could not remove wallet ${walletName} from biometric setup list.`,
      });
    }
  }

  /**
   * Split a backup string into multiple chunks suitable for QR codes
   * @param backupString The backup string to split (usually base64 encoded)
   * @returns Array of QR code compatible chunks
   */
  static splitBackupForQR(backupString: string): string[] {
    this.backupLogger.debug('Splitting backup for QR codes', {
      backupSize: backupString.length,
      maxChunkSize: this.MAX_QR_CHUNK_SIZE,
    });

    // Calculate optimal chunk size (leave more room for metadata to ensure mobile readability)
    const actualChunkSize = this.MAX_QR_CHUNK_SIZE - 200;

    // Count total chunks needed
    const totalChunks = Math.ceil(backupString.length / actualChunkSize);

    // Split into chunks and add metadata
    const chunks: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * actualChunkSize;
      const end = Math.min(start + actualChunkSize, backupString.length);
      const chunkData = backupString.substring(start, end);

      // Format: HEADER|index/total|data
      const chunk = `${this.QR_CHUNK_HEADER}|${i + 1}/${totalChunks}|${chunkData}`;
      chunks.push(chunk);
    }

    this.backupLogger.debug('Backup split into QR chunks', {
      chunkCount: chunks.length,
      averageChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length),
    });
    return chunks;
  }

  /**
   * Get information about a QR chunk
   * @param chunkData The QR chunk data
   * @returns Object with index and totalChunks
   */
  static getQRChunkInfo(chunkData: string): { index: number; totalChunks: number } | null {
    try {
      // Check if this is a valid QR chunk
      if (!chunkData.startsWith(this.QR_CHUNK_HEADER)) {
        this.backupLogger.debug('Invalid QR chunk format - missing header');
        return null;
      }

      // Extract metadata
      const parts = chunkData.split('|');
      if (parts.length < 3) return null;

      const indexInfo = parts[1].split('/');
      if (indexInfo.length !== 2) return null;

      const index = parseInt(indexInfo[0], 10);
      const totalChunks = parseInt(indexInfo[1], 10);

      if (isNaN(index) || isNaN(totalChunks)) {
        this.backupLogger.debug('Invalid QR chunk format - invalid index/totalChunks');
        return null;
      }

      return { index, totalChunks };
    } catch (error) {
      this.backupLogger.debug('Error parsing QR chunk info', error);
      return null;
    }
  }

  /**
   * Combine multiple QR chunks back into the original backup string
   * @param chunks Array of QR chunks to combine
   * @returns The combined backup string
   */
  static async combineQRChunks(chunks: string[]): Promise<string> {
    try {
      this.backupLogger.debug('Combining QR chunks', { chunkCount: chunks.length });

      // Group chunks by header type
      const qrChunks: { index: number; data: string; totalChunks: number }[] = [];
      let totalChunksExpected = 0;

      // Extract data from each chunk
      for (const chunk of chunks) {
        // Handle different formats
        if (chunk.startsWith(this.QR_CHUNK_HEADER)) {
          // Standard QR chunk format
          const parts = chunk.split('|');
          if (parts.length < 3) continue;

          const indexInfo = parts[1].split('/');
          if (indexInfo.length !== 2) continue;

          const index = parseInt(indexInfo[0], 10);
          const totalChunks = parseInt(indexInfo[1], 10);

          if (isNaN(index) || isNaN(totalChunks)) continue;

          totalChunksExpected = totalChunks;
          qrChunks.push({
            index,
            data: parts.slice(2).join('|'), // In case data contains |
            totalChunks,
          });
        } else if (chunk.includes(this.BACKUP_MAGIC_HEADER)) {
          // Single QR code with full backup
          return chunk;
        }
      }

      // Check if we have all chunks
      if (qrChunks.length < totalChunksExpected) {
        this.backupLogger.warn('Incomplete QR backup', {
          received: qrChunks.length,
          expected: totalChunksExpected,
        });
        throw new Error(
          `Incomplete backup: ${qrChunks.length} of ${totalChunksExpected} chunks received`,
        );
      }

      // Sort chunks by index
      qrChunks.sort((a, b) => a.index - b.index);
      this.backupLogger.debug('QR chunks sorted and ready to combine');

      // Combine data
      const result = qrChunks.map((chunk) => chunk.data).join('');
      this.backupLogger.debug('QR chunks combined successfully', { resultLength: result.length });
      return result;
    } catch (error) {
      this.backupLogger.error('Failed to combine QR chunks', error);
      throw new Error(
        `Failed to combine QR chunks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Convert a base64 string to a File object
   * @param base64String The base64 string to convert
   * @param fileName The name for the output file
   * @returns A File object
   */
  static convertBase64ToFile(base64String: string, fileName: string): File {
    this.backupLogger.debug('Converting base64 to file', { fileName });
    // Remove data URL prefix if present
    const base64Data = base64String.includes('base64,')
      ? base64String.split('base64,')[1]
      : base64String;

    // Convert base64 to binary
    const byteCharacters = atob(base64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    // Create a blob and then a file from the binary data
    const blob = new Blob(byteArrays, { type: 'application/json' });
    this.backupLogger.debug('Base64 converted to file successfully', { size: blob.size });
    return new File([blob], fileName, { type: 'application/json' });
  }
}
