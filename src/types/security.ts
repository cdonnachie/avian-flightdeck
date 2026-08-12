// Security-related types and interfaces

export interface BiometricCapabilities {
  isSupported: boolean;
  availableTypes: BiometricType[];
  isEnrolled: boolean;
}

export type BiometricType = 'fingerprint' | 'face' | 'voice' | 'iris';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometricType?: BiometricType;
  walletPassword?: string; // The stored wallet password for unlocking
}

export interface TermsAcceptance {
  accepted: boolean;
  version: string;
  timestamp: number;
  userAgent?: string;
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: number;
  action: SecurityAction;
  details: string;
  userAgent?: string;
  ipAddress?: string;
  success: boolean;
  walletAddress?: string;
}

export type SecurityAction =
  | 'wallet_unlock'
  | 'wallet_lock'
  | 'biometric_auth'
  | 'biometric_setup'
  | 'password_auth'
  | 'transaction_sign'
  | 'backup_create'
  | 'backup_restore'
  | 'mnemonic_export'
  | 'private_key_export'
  | 'wallet_create'
  | 'wallet_import'
  | 'settings_change'
  | 'auto_lock_triggered';

export interface AutoLockSettings {
  enabled: boolean;
  timeout: number; // in milliseconds
  biometricUnlock: boolean;
  requirePasswordAfterTimeout: boolean;
  // Opt-in full-screen password wall shown when opening the wallet. Default false (the wallet
  // loads read-only and only key-using actions prompt). `undefined` in stored settings means a
  // pre-existing install that predates this toggle — migrated to `true` to preserve its wall.
  screenLockEnabled?: boolean;
}

export interface SecuritySettings {
  autoLock: AutoLockSettings;
  biometric: {
    enabled: boolean;
    requireForTransactions: boolean;
    requireForExports: boolean;
  };
  auditLog: {
    enabled: boolean;
    retentionDays: number;
    maxEntries: number;
  };
}

export interface SecurityState {
  isLocked: boolean;
  lastActivity: number;
  lockReason?: 'timeout' | 'manual' | 'failed_auth';
  biometricAvailable: boolean;
  requiresPasswordUnlock: boolean;
}
