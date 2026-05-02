'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, RefreshCw, AlertTriangle, Eye, EyeOff, ScrollText } from 'lucide-react';
import * as bip39 from 'bip39';
import { AddressType, ADDRESS_TYPE_INFO } from '@/services/wallet/WalletService';
import PasswordStrengthChecker, { PasswordStrength } from '@/components/PasswordStrength';
import { StorageService } from '@/services/core/StorageService';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

// Define the wallet creation modes
export type WalletCreationMode = 'create' | 'importMnemonic' | 'importWIF' | 'importDescriptor';

// Define component props
interface WalletCreationFormProps {
  mode: WalletCreationMode;
  onSubmit: (data: WalletCreationData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  isFullscreen?: boolean;
}

// Define the data structure for wallet creation
export interface WalletCreationData {
  name: string;
  password: string;
  mnemonic?: string;
  privateKey?: string;
  descriptor?: string; // BIP380 xprv descriptor
  passphrase?: string; // Optional BIP39 passphrase
  mnemonicLength?: '12' | '24'; // Recovery phrase length
  coinType?: 921 | 175; // BIP44 coin type for import compatibility
  addressType?: AddressType; // Script type / BIP derivation standard
}

export default function WalletCreationForm({
  mode,
  onSubmit,
  onCancel,
  isSubmitting,
  isFullscreen = false,
}: WalletCreationFormProps) {
  // Form state
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [mnemonicLength, setMnemonicLength] = useState<'12' | '24'>('12');
  const [coinType, setCoinType] = useState<921 | 175>(921);
  const [addressType, setAddressType] = useState<AddressType>('p2pkh');

  // Error states
  const [nameError, setNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [mnemonicError, setMnemonicError] = useState('');
  const [privateKeyError, setPrivateKeyError] = useState('');
  const [descriptorError, setDescriptorError] = useState('');

  // Password strength
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null);

  // Generated mnemonic for create mode
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string>('');
  const [showMnemonic, setShowMnemonic] = useState<boolean>(false);

  // Password visibility states
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Generate a creative bird-themed wallet name
  const generateWalletName = useCallback(async () => {
    // Bird species
    const birds = [
      'Eagle',
      'Falcon',
      'Hawk',
      'Owl',
      'Raven',
      'Robin',
      'Sparrow',
      'Phoenix',
      'Cardinal',
      'Finch',
      'Kestrel',
      'Warbler',
      'Kingfisher',
      'Avian',
      'Jay',
      'Swift',
      'Hummingbird',
      'Starling',
      'Nightingale',
      'Osprey',
    ];

    // Adjectives
    const adjectives = [
      'Soaring',
      'Flying',
      'Golden',
      'Swift',
      'Majestic',
      'Wise',
      'Fierce',
      'Crimson',
      'Azure',
      'Silver',
      'Midnight',
      'Emerald',
      'Radiant',
      'Royal',
      'Mystic',
      'Celestial',
      'Daring',
      'Noble',
      'Stellar',
      'Vibrant',
    ];

    // Additional adjectives to use if we need more variations
    const extraAdjectives = [
      'Brave',
      'Proud',
      'Mighty',
      'Serene',
      'Wild',
      'Nimble',
      'Shining',
      'Graceful',
      'Powerful',
      'Clever',
      'Agile',
      'Exotic',
      'Dazzling',
      'Elegant',
      'Vigilant',
      'Electric',
      'Obsidian',
      'Amber',
      'Fiery',
    ];

    // Name formats
    const formats = [
      (adj: string, bird: string) => `${adj} ${bird}`,
      (adj: string, bird: string) => `${bird} Nest`,
      (adj: string, bird: string) => `Sky ${bird}`,
      (adj: string, bird: string) => `${bird} Flight`,
      (adj: string, bird: string) => `${adj} Wings`,
      (adj: string, bird: string) => `${bird}'s Treasury`,
      (adj: string, bird: string) => `${adj} Feathers`,
      (adj: string, bird: string) => `${bird} Vault`,
    ];

    // Helper to get random item from array
    function getRandomItem<T>(array: T[]): T {
      return array[Math.floor(Math.random() * array.length)];
    }

    // Get existing wallet names to avoid duplicates
    let existingNames: string[] = [];
    try {
      const allWallets = await StorageService.getAllWallets();
      existingNames = allWallets.map((wallet) => wallet.name);
    } catch (error) {
      // Silent handling - continue without existing names if there was an error
    }

    // Function to generate a name and check if it's unique
    const generateUniqueName = (): string => {
      const adj = getRandomItem(adjectives);
      const bird = getRandomItem(birds);
      const formatFunc = getRandomItem(formats);

      // Generate a name
      const name = formatFunc(adj, bird);

      // Check if it already exists
      if (existingNames.includes(name)) {
        // If it exists, try with a different format or words
        return generateUniqueNameWithExtra();
      }

      return name;
    };

    // Function to generate a name with extra variations if needed
    const generateUniqueNameWithExtra = (): string => {
      // Try with extra adjectives
      const adj = getRandomItem([...adjectives, ...extraAdjectives]);
      const bird = getRandomItem(birds);
      const formatFunc = getRandomItem(formats);

      const name = formatFunc(adj, bird);

      // Check if it already exists
      if (existingNames.includes(name)) {
        // Add a number suffix if still not unique
        let counter = 1;
        let nameWithSuffix = `${name} ${counter}`;

        while (existingNames.includes(nameWithSuffix) && counter < 100) {
          counter++;
          nameWithSuffix = `${name} ${counter}`;
        }

        return nameWithSuffix;
      }

      return name;
    };

    // Generate a unique name
    return generateUniqueName();
  }, []);

  // Helper function to handle name generation button clicks
  const handleGenerateWalletName = useCallback(async () => {
    const newName = await generateWalletName();
    setWalletName(newName);
  }, [generateWalletName]);

  // Generate a wallet name on component mount
  useEffect(() => {
    handleGenerateWalletName();
  }, [handleGenerateWalletName]);

  // Function to handle password strength changes
  const handlePasswordStrengthChange = useCallback((strength: PasswordStrength) => {
    setPasswordStrength(strength);
  }, []);

  // Generate a new mnemonic in create mode
  const handleGenerateMnemonic = async () => {
    // Validate wallet name
    if (!walletName || walletName.trim() === '') {
      setNameError('Wallet name is required');
      return;
    }

    // Validate passwords
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }

    if (passwordStrength === 'weak') {
      setPasswordError('Please use a stronger password for better security');
      return;
    }

    try {
      // Clear previous errors
      setPasswordError('');

      // Generate a new mnemonic using bip39 directly
      const entropyBits = mnemonicLength === '24' ? 256 : 128;
      const newMnemonic = bip39.generateMnemonic(entropyBits); // 12 or 24 words
      setGeneratedMnemonic(newMnemonic);
      setShowMnemonic(true);
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to generate mnemonic');
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Validate wallet name
    if (!walletName || walletName.trim() === '') {
      setNameError('Wallet name is required');
      return;
    }

    // Validate passwords
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }

    if (passwordStrength === 'weak') {
      setPasswordError('Please use a stronger password for better security');
      return;
    }

    // Validate mnemonic if in import mnemonic mode
    if (mode === 'importMnemonic' && !mnemonic.trim()) {
      setMnemonicError('Recovery phrase is required');
      return;
    }

    // Validate mnemonic word count if in import mnemonic mode
    if (mode === 'importMnemonic') {
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        setMnemonicError('Recovery phrase must be exactly 12 or 24 words');
        return;
      }
      // Clear error if valid
      setMnemonicError('');
    }

    // Validate private key if in import WIF mode
    if (mode === 'importWIF' && !privateKey.trim()) {
      setPrivateKeyError('Private key is required');
      return;
    }

    // Validate descriptor if in import descriptor mode
    if (mode === 'importDescriptor') {
      if (!descriptor.trim()) {
        setDescriptorError('Descriptor is required');
        return;
      }
      // Basic format check
      const clean = descriptor.trim().replace(/#[a-zA-Z0-9]+$/, '');
      if (!clean.startsWith('pkh(') && !clean.startsWith('wpkh(') && !clean.startsWith('sh(wpkh(')) {
        setDescriptorError('Invalid descriptor format. Expected pkh(...), wpkh(...), or sh(wpkh(...)).');
        return;
      }
      if (!clean.includes('xprv')) {
        setDescriptorError('Descriptor must contain an xprv (private key). Run `listdescriptors true` in Avian Core.');
        return;
      }
      setDescriptorError('');
    }

    // Create data object for submission
    const data: WalletCreationData = {
      name: walletName.trim(),
      password,
    };

    // Add specific data based on mode
    if (mode === 'create') {
      data.mnemonic = generatedMnemonic;
      data.mnemonicLength = mnemonicLength;
      if (passphrase) {
        data.passphrase = passphrase;
      }
    } else if (mode === 'importMnemonic') {
      data.mnemonic = mnemonic.trim();
      data.coinType = coinType; // Include coin type for legacy compatibility
      data.addressType = addressType;
      if (passphrase) {
        data.passphrase = passphrase;
      }
    } else if (mode === 'importWIF') {
      data.privateKey = privateKey.trim();
    } else if (mode === 'importDescriptor') {
      data.descriptor = descriptor.trim();
    }

    // Submit form data
    await onSubmit(data);
  };

  // Go back from mnemonic view to password entry in create mode
  const handleBackFromMnemonic = () => {
    setShowMnemonic(false);
    setGeneratedMnemonic('');
    setPassphrase('');
    setShowAdvancedOptions(false);
  };

  // Render appropriate titles based on mode
  const getTitleAndDescription = () => {
    switch (mode) {
      case 'create':
        return {
          title: 'Create New Wallet',
          description: 'Create a new wallet with a randomly generated seed phrase',
        };
      case 'importMnemonic':
        return {
          title: 'Import from Recovery Phrase',
          description: 'Restore an existing wallet using your 12 or 24-word recovery phrase',
        };
      case 'importWIF':
        return {
          title: 'Import from Private Key',
          description: 'Import an existing wallet using your private key (WIF format)',
        };
      case 'importDescriptor':
        return {
          title: 'Import from Descriptor',
          description: 'Import from an Avian Core v5 output script descriptor (listdescriptors true)',
        };
    }
  };

  // Get form button text based on mode and submission state
  const getButtonText = () => {
    if (isSubmitting) {
      switch (mode) {
        case 'create':
          return 'Creating...';
        case 'importMnemonic':
          return 'Importing...';
        case 'importWIF':
          return 'Importing...';
        case 'importDescriptor':
          return 'Importing...';
      }
    } else {
      switch (mode) {
        case 'create':
          return showMnemonic ? 'Create Wallet' : 'Continue';
        case 'importMnemonic':
          return 'Import Wallet';
        case 'importWIF':
          return 'Import Wallet';
        case 'importDescriptor':
          return 'Import Wallet';
      }
    }
  };

  // Determine if form button should be disabled
  const isButtonDisabled = () => {
    if (isSubmitting) return true;

    const hasValidPassword =
      password && confirmPassword && password === confirmPassword && passwordStrength !== 'weak';

    if (mode === 'create') {
      if (!showMnemonic) {
        return !walletName || !hasValidPassword;
      } else {
        return false; // Once mnemonic is shown, we can proceed
      }
    } else if (mode === 'importMnemonic') {
      return !walletName || !mnemonic || !hasValidPassword;
    } else if (mode === 'importWIF') {
      return !walletName || !privateKey || !hasValidPassword;
    } else if (mode === 'importDescriptor') {
      return !walletName || !descriptor || !hasValidPassword;
    }

    return true;
  };

  // Get title and description for current mode
  const { title, description } = getTitleAndDescription();

  // Create wallet form (password entry)
  if (mode === 'create' && !showMnemonic) {
    return (
      <Card className={isFullscreen ? 'border-0 shadow-none' : ''}>
        {!isFullscreen && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-4 pt-4">
          <p className="text-gray-700 dark:text-gray-300">
            Set a password to encrypt your new wallet. Make sure to remember this password as it
            cannot be recovered.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-name">Wallet Name</Label>
              <div className="flex gap-2">
                <Input
                  id="wallet-name"
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Enter wallet name"
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateWalletName}
                  disabled={isSubmitting}
                  title="Generate creative wallet name"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {walletName && (
                <p className="text-xs text-muted-foreground mt-1">
                  Creative bird-themed name! You can keep it or customize your own.
                </p>
              )}
              {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
            </div>

            {/* Mnemonic Length Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Recovery Phrase Length</Label>
              <div className="space-y-3">
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mnemonicLength"
                      value="12"
                      checked={mnemonicLength === '12'}
                      onChange={(e) => setMnemonicLength(e.target.value as '12' | '24')}
                      className="w-4 h-4"
                      disabled={isSubmitting}
                    />
                    <span className="text-sm">12 words (Standard)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mnemonicLength"
                      value="24"
                      checked={mnemonicLength === '24'}
                      onChange={(e) => setMnemonicLength(e.target.value as '12' | '24')}
                      className="w-4 h-4"
                      disabled={isSubmitting}
                    />
                    <span className="text-sm">24 words (Enhanced Security)</span>
                  </label>
                </div>

                {mnemonicLength === '24' && (
                  <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-amber-800 dark:text-amber-200">
                      Compatibility Warning
                    </AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-300">
                      <div className="space-y-2">
                        <p>
                          24-word recovery phrases provide enhanced security but may not be
                          compatible with other Avian wallets.
                        </p>
                        <p className="font-medium">
                          ⚠️ Only use this option if you plan to exclusively use Avian FlightDeck or
                          are certain about compatibility with your other tools.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <p className="text-xs text-muted-foreground">
                  {mnemonicLength === '12'
                    ? 'Standard 12-word phrases are compatible with all Avian wallets and provide excellent security.'
                    : '24-word phrases provide maximum security but may not work with other Avian wallet software.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <div className="relative">
                <Input
                  id="create-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>

              {/* Password strength component */}
              <PasswordStrengthChecker
                password={password}
                onStrengthChange={handlePasswordStrengthChange}
                className="mt-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerateMnemonic}
            variant="default"
            className="bg-avian-600 hover:bg-avian-700"
            disabled={isButtonDisabled()}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Continue
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Mnemonic review view (create mode)
  if (mode === 'create' && showMnemonic) {
    return (
      <Card className={isFullscreen ? 'border-0 shadow-none' : ''}>
        {!isFullscreen && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>Backup your recovery phrase</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-4 pt-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm font-medium mb-2">
              IMPORTANT: Write down your recovery phrase
            </p>
            <p className="text-yellow-700 dark:text-yellow-300 text-xs">
              This {mnemonicLength}-word phrase is the ONLY way to recover your wallet if you lose
              access. Write it down and keep it in a secure location. Never share it with anyone.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Label htmlFor="mnemonic-display">Recovery Phrase</Label>
              <div className="mt-1 relative">
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-4 font-mono text-sm relative">
                  {generatedMnemonic}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label
                  htmlFor="show-advanced"
                  className="text-sm font-medium cursor-pointer flex items-center"
                >
                  <span onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}>
                    Advanced Options
                  </span>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  {showAdvancedOptions ? 'Hide' : 'Show'}
                </Button>
              </div>

              {showAdvancedOptions && (
                <div className="pt-2 space-y-3 border-t border-gray-200 dark:border-gray-800 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="passphrase" className="flex items-center">
                      <span>BIP39 Passphrase (Optional &quot;25th Word&quot;)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="passphrase"
                        type={showPassphrase ? "text" : "password"}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter optional passphrase for extra security"
                        disabled={isSubmitting}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        disabled={isSubmitting}
                      >
                        {showPassphrase ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A passphrase adds an extra layer of security. If used, you&apos;ll need both
                      the recovery phrase AND this passphrase to restore your wallet.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between mt-4">
          <Button variant="outline" onClick={handleBackFromMnemonic} disabled={isSubmitting}>
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            variant="default"
            className="bg-avian-600 hover:bg-avian-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating Wallet...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Create Wallet
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Import from mnemonic form
  if (mode === 'importMnemonic') {
    return (
      <Card className={isFullscreen ? 'border-0 shadow-none' : ''}>
        {!isFullscreen && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-wallet-name">Wallet Name</Label>
              <div className="flex gap-2">
                <Input
                  id="import-wallet-name"
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Enter wallet name"
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateWalletName}
                  disabled={isSubmitting}
                  title="Generate creative wallet name"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {walletName && !nameError && (
                <p className="text-xs text-muted-foreground mt-1">
                  Creative bird-themed name! You can keep it or customize your own.
                </p>
              )}
              {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mnemonic">Recovery Phrase</Label>
              <Textarea
                id="mnemonic"
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                placeholder="Enter your recovery phrase (12 or 24 words separated by spaces)"
                disabled={isSubmitting}
                className="h-20"
              />
              {mnemonic.trim() && (
                <p className="text-xs text-muted-foreground">
                  {mnemonic.trim().split(/\s+/).length} words detected
                </p>
              )}

              {/* Show compatibility warning for 24-word imports */}
              {mnemonic.trim() && mnemonic.trim().split(/\s+/).length === 24 && (
                <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-blue-800 dark:text-blue-200">
                    24-Word Recovery Phrase Detected
                  </AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    <p>
                      You&apos;re importing a 24-word recovery phrase. This provides enhanced
                      security but may not be compatible with other Avian wallet software.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {mnemonicError && (
                <Alert variant="destructive">
                  <AlertDescription>{mnemonicError}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label
                  htmlFor="show-advanced"
                  className="text-sm font-medium cursor-pointer flex items-center"
                >
                  <span onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}>
                    Advanced Options
                  </span>
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  {showAdvancedOptions ? 'Hide' : 'Show'}
                </Button>
              </div>

              {showAdvancedOptions && (
                <div className="pt-2 space-y-3 border-t border-gray-200 dark:border-gray-800 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="passphrase" className="flex items-center">
                      <span>BIP39 Passphrase (Optional &quot;25th Word&quot;)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="passphrase"
                        type={showPassphrase ? "text" : "password"}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter optional passphrase for extra security"
                        disabled={isSubmitting}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        disabled={isSubmitting}
                      >
                        {showPassphrase ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only enter if you used a passphrase when creating your wallet.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Address Type</Label>
                    <div className="space-y-2">
                      {(Object.keys(ADDRESS_TYPE_INFO) as AddressType[]).map((type) => (
                        <label key={type} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="addressType"
                            value={type}
                            checked={addressType === type}
                            onChange={() => setAddressType(type)}
                            className="w-4 h-4"
                            disabled={isSubmitting}
                          />
                          <span className="text-sm">
                            {ADDRESS_TYPE_INFO[type].label} ({ADDRESS_TYPE_INFO[type].bipLabel})
                          </span>
                        </label>
                      ))}
                    </div>
                    {addressType !== 'p2pkh' && (
                      <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-amber-800 dark:text-amber-200">Asset Transfers Not Supported</AlertTitle>
                        <AlertDescription className="text-amber-700 dark:text-amber-300">
                          Avian asset operations (issue, transfer) require a Legacy (P2PKH) address.
                          SegWit addresses can only send and receive AVN.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      BIP44 Coin Type (Legacy Compatibility)
                    </Label>
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="coinType"
                            value="921"
                            checked={coinType === 921}
                            onChange={(e) => setCoinType(Number(e.target.value) as 921 | 175)}
                            className="w-4 h-4"
                            disabled={isSubmitting}
                          />
                          <span className="text-sm">921 - Avian (Standard)</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="coinType"
                            value="175"
                            checked={coinType === 175}
                            onChange={(e) => setCoinType(Number(e.target.value) as 921 | 175)}
                            className="w-4 h-4"
                            disabled={isSubmitting}
                          />
                          <span className="text-sm">175 - Ravencoin (Legacy)</span>
                        </label>
                      </div>

                      {coinType === 175 && (
                        <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle className="text-amber-800 dark:text-amber-200">
                            Legacy Compatibility Mode
                          </AlertTitle>
                          <AlertDescription className="text-amber-700 dark:text-amber-300">
                            <p>
                              You&apos;re importing a wallet that may have been created with
                              Ravencoin&apos;s coin type (175). This setting affects the derivation
                              path and generates different addresses.
                            </p>
                            <p className="font-medium mt-1">
                              ⚠️ Only use this if your wallet was originally created with coin type
                              175. Using the wrong coin type will result in a different wallet
                              address.
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {coinType === 921
                          ? 'Standard Avian coin type - use this for wallets created in Avian FlightDeck or other Avian wallets.'
                          : "Legacy Ravencoin compatibility - use only if your wallet was created with Ravencoin's coin type before Avian's standardization."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-password">Password</Label>
              <div className="relative">
                <Input
                  id="import-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>

              <PasswordStrengthChecker
                password={password}
                onStrengthChange={handlePasswordStrengthChange}
                className="mt-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="import-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="default"
            className="bg-avian-600 hover:bg-avian-700"
            disabled={isButtonDisabled()}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Import Wallet
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Import from private key (WIF) form
  if (mode === 'importWIF') {
    return (
      <Card className={isFullscreen ? 'border-0 shadow-none' : ''}>
        {!isFullscreen && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wif-wallet-name">Wallet Name</Label>
              <div className="flex gap-2">
                <Input
                  id="wif-wallet-name"
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Enter wallet name"
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateWalletName}
                  disabled={isSubmitting}
                  title="Generate creative wallet name"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {walletName && !nameError && (
                <p className="text-xs text-muted-foreground mt-1">
                  Creative bird-themed name! You can keep it or customize your own.
                </p>
              )}
              {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wif">Private Key (WIF format)</Label>
              <Input
                id="wif"
                type="text"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter WIF private key"
                disabled={isSubmitting}
              />
              {privateKeyError && (
                <Alert variant="destructive">
                  <AlertDescription>{privateKeyError}</AlertDescription>
                </Alert>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                A WIF key typically starts with a &apos;5&apos;, &apos;K&apos;, or &apos;L&apos; and
                is 51-52 characters long. Keep this key secure and never share it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wif-import-password">Password</Label>
              <div className="relative">
                <Input
                  id="wif-import-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>

              <PasswordStrengthChecker
                password={password}
                onStrengthChange={handlePasswordStrengthChange}
                className="mt-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wif-import-confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="wif-import-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="default"
            className="bg-avian-600 hover:bg-avian-700"
            disabled={isButtonDisabled()}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Import Wallet
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // ── Import from Descriptor ──────────────────────────────────────────────────
  if (mode === 'importDescriptor') {
    return (
      <Card className={isFullscreen ? 'border-0 shadow-none' : ''}>
        {!isFullscreen && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="w-5 h-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent className="space-y-4 pt-4">
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              In Avian Core v5, run: <code className="font-mono text-xs bg-blue-100 dark:bg-blue-800 px-1 rounded">listdescriptors true</code> — then paste the descriptor for the address type you want to import.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="desc-wallet-name">Wallet Name</Label>
              <div className="flex gap-2">
                <Input
                  id="desc-wallet-name"
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Enter wallet name"
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateWalletName}
                  disabled={isSubmitting}
                  title="Generate creative wallet name"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriptor-input">Output Script Descriptor</Label>
              <Textarea
                id="descriptor-input"
                value={descriptor}
                onChange={(e) => { setDescriptor(e.target.value); setDescriptorError(''); }}
                placeholder="wpkh([a1b2c3d4/84h/921h/0h]xprvABC.../0/*)#checksum"
                disabled={isSubmitting}
                className="font-mono text-xs min-h-[80px] resize-none"
              />
              {descriptorError && (
                <Alert variant="destructive">
                  <AlertDescription>{descriptorError}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Paste a descriptor containing an <strong>xprv</strong> (private key). Descriptors with xpub only cannot sign transactions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc-import-password">Password</Label>
              <div className="relative">
                <Input
                  id="desc-import-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                </Button>
              </div>
              {passwordStrength && <PasswordStrengthChecker password={password} onStrengthChange={handlePasswordStrengthChange} className="mt-2" />}
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc-confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="desc-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                </Button>
              </div>
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="default"
            className="bg-avian-600 hover:bg-avian-700"
            disabled={isButtonDisabled()}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <ScrollText className="w-4 h-4 mr-2" />
                Import Wallet
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Fallback - should never happen but TypeScript needs this
  return null;
}