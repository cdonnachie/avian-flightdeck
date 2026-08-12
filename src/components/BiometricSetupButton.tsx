'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, Check, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { securityService } from '@/services/core/SecurityService';
import { StorageService } from '@/services/core/StorageService';
import { toast } from 'sonner';

interface BiometricSetupButtonProps {
  walletAddress?: string; // Optional wallet address, uses active wallet if not specified
  onSetupComplete?: (success: boolean) => void;
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline'; // Button variants
  size?: 'xs' | 'sm' | 'md' | 'lg'; // Button sizes
  className?: string;
}

export default function BiometricSetupButton({
  walletAddress,
  onSetupComplete,
  variant = 'primary',
  size = 'md',
  className = '',
}: BiometricSetupButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [canSetup, setCanSetup] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [walletInfo, setWalletInfo] = useState<{ name?: string; address?: string }>({});
  const [walletIsSetup, setWalletIsSetup] = useState(false);

  // Get button size classes
  const getSizeClass = () => {
    // If custom className is provided, we'll prioritize that
    if (className && (className.includes('py-') || className.includes('text-'))) {
      return '';
    }

    switch (size) {
      case 'xs':
        return 'btn-xs';
      case 'sm':
        return 'btn-sm';
      case 'lg':
        return 'btn-lg';
      default:
        return ''; // Medium (default)
    }
  };

  // Get button variant classes
  const getVariantClass = () => {
    // If custom className is provided, we'll prioritize that
    if (className && (className.includes('bg-') || className.includes('border-'))) {
      return '';
    }

    switch (variant) {
      case 'secondary':
        return 'btn-secondary';
      case 'accent':
        return 'btn-accent';
      case 'ghost':
        return 'btn-ghost';
      case 'outline':
        return 'btn-outline';
      default:
        return 'btn-primary'; // Primary (default)
    }
  };

  // Check if biometrics are set up and whether they can be set up
  const checkSetupStatus = async () => {
    try {
      // Get wallet info first
      let targetAddress = walletAddress;
      if (!targetAddress) {
        const activeWallet = await StorageService.getActiveWallet();
        if (activeWallet) {
          targetAddress = activeWallet.address;
          setWalletInfo({
            name: activeWallet.name,
            address: activeWallet.address,
          });
        }
      } else {
        const wallet = await StorageService.getWalletByAddress(targetAddress);
        if (wallet) {
          setWalletInfo({
            name: wallet.name,
            address: wallet.address,
          });
        }
      }

      // First check if biometrics are already enabled for this wallet
      const isEnabled = await securityService.isWalletBiometricEnabled(targetAddress);
      setWalletIsSetup(isEnabled);

      if (isEnabled) {
        // If already enabled, we can't set up again
        setCanSetup(false);
        return;
      }

      // Check if biometrics can be set up
      const setupCheck = await securityService.canSetupBiometrics(targetAddress);
      setCanSetup(setupCheck.canSetup);
      setRequiresPassword(setupCheck.requiresPassword);
    } catch (error) {
      setCanSetup(false);
      toast.error('Failed to check biometric setup status', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Run check when wallet address changes
  useEffect(() => {
    checkSetupStatus();
  }, [walletAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetupBiometrics = async () => {
    if (requiresPassword && !showPasswordInput) {
      setShowPasswordInput(true);
      return;
    }

    setIsLoading(true);
    try {
      const result = await securityService.quickSetupBiometrics(
        requiresPassword ? password : undefined,
        walletAddress,
      );

      if (result.success) {
        toast.success('Success', {
          description: 'Biometric authentication set up successfully',
          duration: 5000,
        });

        // Update status
        await checkSetupStatus();

        // Reset state
        setShowPasswordInput(false);
        setPassword('');

        // Notify parent component
        onSetupComplete?.(true);
      } else {
        toast.error('Failed', {
          description: result.message,
          duration: 5000,
        });

        // For password errors, keep the input open
        if (result.message.includes('password') && showPasswordInput) {
          setPassword('');
        } else {
          setShowPasswordInput(false);
          setPassword('');
        }

        // Notify parent component
        onSetupComplete?.(false);
      }
    } catch (error) {
      toast.error('Error', {
        description: `Failed to set up biometrics: ${error}`,
        duration: 5000,
      });
      onSetupComplete?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Show password input if needed
  if (showPasswordInput) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter wallet password"
            className="w-full bg-card/10 border-0 text-white px-4 py-3 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-white"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            className="flex-1 py-3 px-4 bg-transparent border border-border text-white rounded-lg hover:bg-card/5"
            onClick={() => setShowPasswordInput(false)}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="flex-1 py-3 px-4 bg-transparent border border-primary/30 text-white rounded-lg hover:bg-primary/10 flex items-center justify-center"
            onClick={handleSetupBiometrics}
            disabled={isLoading || !password}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Fingerprint className="w-5 h-5 mr-2" />
            )}
            Confirm
          </button>
        </div>
      </div>
    );
  }

  // For when biometrics are already set up
  if (walletIsSetup) {
    return (
      <button
        className={`btn ${getVariantClass()} ${getSizeClass()} ${className} opacity-70`}
        disabled={true}
      >
        <Check className="w-5 h-5 mr-2" />
        Biometrics Enabled
      </button>
    );
  }

  // For when biometrics can't be set up (but not already set up)
  if (!canSetup) {
    return (
      <button
        className={`btn ${getVariantClass()} ${getSizeClass()} ${className} opacity-70`}
        disabled={true}
      >
        <AlertCircle className="w-5 h-5 mr-2" />
        Biometrics Unavailable
      </button>
    );
  }

  // Standard setup button
  return (
    <button
      className={`btn ${getVariantClass()} ${getSizeClass()} ${className}`}
      onClick={handleSetupBiometrics}
      disabled={isLoading}
    >
      <div className="flex flex-row items-center justify-center gap-3">
        {isLoading ? (
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        ) : (
          <Fingerprint className="w-5 h-5 mr-2" />
        )}
        Set Up Biometrics
      </div>
    </button>
  );
}
