'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { Wallet, Import, FileKey, ArrowLeft, Upload, QrCode, AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { StorageService } from '@/services/core/StorageService';
import WalletCreationForm, {
    WalletCreationMode,
    WalletCreationData,
} from '@/components/WalletCreationForm';
import { useMediaQuery } from '@/hooks/use-media-query';
import { BackupService } from '@/services/core/BackupService';
import { BackupQRModal } from '@/components/BackupQRModal';

// Import Shadcn UI components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

export default function OnboardingPage() {
    const router = useRouter();
    const { reloadActiveWallet } = useWallet();
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [step, setStep] = useState<'welcome' | 'method' | 'form' | 'backup-file' | 'success'>('welcome');
    const [formMode, setFormMode] = useState<WalletCreationMode>('create');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showBackupQRModal, setShowBackupQRModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [backupPassword, setBackupPassword] = useState('');
    const [showBackupPassword, setShowBackupPassword] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false);

    // Check if wallet exists and redirect if so
    useEffect(() => {
        const checkWallet = async () => {
            const walletExists = await StorageService.hasWallet();
            if (walletExists) {
                router.push('/');
            }
        };

        checkWallet();
    }, [router]);

    // Handle wallet creation/import form submission
    const handleFormSubmit = async (data: WalletCreationData) => {
        try {
            setIsSubmitting(true);

            const { WalletService } = await import('@/services/wallet/WalletService');
            const walletService = new WalletService();

            let newWallet;

            if (formMode === 'create') {
                newWallet = await walletService.createNewWallet({
                    name: data.name.trim(),
                    password: data.password,
                    useMnemonic: true,
                    mnemonic: data.mnemonic,
                    passphrase: data.passphrase,
                    makeActive: true,
                });
            } else if (formMode === 'importMnemonic') {
                newWallet = await walletService.importWalletFromMnemonic({
                    name: data.name.trim(),
                    mnemonic: data.mnemonic!.trim(),
                    password: data.password,
                    passphrase: data.passphrase,
                    coinType: data.coinType,
                    makeActive: true,
                });
            } else if (formMode === 'importWIF') {
                newWallet = await walletService.importWalletFromPrivateKey({
                    name: data.name.trim(),
                    privateKey: data.privateKey!.trim(),
                    password: data.password,
                    makeActive: true,
                });
            }

            await reloadActiveWallet();
            setStep('success');

            setTimeout(() => {
                router.push('/');
            }, 2000);

        } catch (error: any) {
            toast.error(error.message || 'Failed to complete wallet operation');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle backup file selection
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setNeedsPassword(false);
        setBackupPassword('');

        try {
            setIsSubmitting(true);

            const { backup, validation } = await BackupService.parseBackupFile(file);

            if (!validation.isValid) {
                toast.error('Invalid backup file', {
                    description: validation.errors.join(', ')
                });
                return;
            }

            await restoreBackup(backup);

        } catch (error: any) {
            if (error.message.includes('encrypted') || error.message.includes('password')) {
                setNeedsPassword(true);
                setIsSubmitting(false);
            } else {
                toast.error('Failed to read backup file', {
                    description: error.message || 'Unknown error occurred'
                });
                setIsSubmitting(false);
            }
        }
    };

    // Handle password verification and restore
    const handlePasswordRestore = async () => {
        if (!selectedFile || !backupPassword) return;

        try {
            setIsSubmitting(true);

            const { backup, validation } = await BackupService.parseBackupFile(selectedFile, backupPassword);

            if (!validation.isValid) {
                toast.error('Invalid backup file', {
                    description: validation.errors.join(', ')
                });
                return;
            }

            await restoreBackup(backup);

        } catch (error: any) {
            toast.error('Failed to restore backup', {
                description: error.message || 'Invalid password or corrupted backup'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Common restore function
    const restoreBackup = async (backup: any) => {
        await BackupService.restoreFromBackup(backup, {
            includeWallets: true,
            includeAddressBook: true,
            includeSettings: true,
            includeTransactions: true,
            includeSecurityAudit: true,
            includeWatchedAddresses: true,
            overwriteExisting: false,
        });

        await reloadActiveWallet();

        toast.success('Backup restored successfully!', {
            description: 'Your wallets and data have been restored.'
        });

        setStep('success');

        setTimeout(() => {
            router.push('/');
        }, 2000);
    };

    const renderWelcome = () => (
        <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                        <Wallet className="w-10 h-10 text-primary" />
                    </div>
                </div>
                <CardTitle className="text-2xl">Welcome to Avian Wallet</CardTitle>
                <p className="text-muted-foreground">
                    Your secure, privacy-focused wallet for Avian Network
                </p>
            </CardHeader>
            <CardContent>
                <Button
                    onClick={() => setStep('method')}
                    className="w-full"
                    size="lg"
                >
                    Get Started <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </CardContent>
        </Card>
    );

    const renderMethodSelection = () => (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2">Choose Setup Method</h1>
                <p className="text-muted-foreground">
                    How would you like to set up your wallet?
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Create New Wallet */}
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => {
                    setFormMode('create');
                    setStep('form');
                }}>
                    <CardHeader>
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                            <Wallet className="w-6 h-6 text-green-600" />
                        </div>
                        <CardTitle className="text-xl">Create New Wallet</CardTitle>
                        <p className="text-muted-foreground">
                            Generate a new wallet with a secure mnemonic phrase
                        </p>
                    </CardHeader>
                </Card>

                {/* Import from Mnemonic */}
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => {
                    setFormMode('importMnemonic');
                    setStep('form');
                }}>
                    <CardHeader>
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                            <FileKey className="w-6 h-6 text-blue-600" />
                        </div>
                        <CardTitle className="text-xl">Import from Mnemonic</CardTitle>
                        <p className="text-muted-foreground">
                            Restore your wallet using a 12 or 24-word phrase
                        </p>
                    </CardHeader>
                </Card>

                {/* Import from Private Key */}
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => {
                    setFormMode('importWIF');
                    setStep('form');
                }}>
                    <CardHeader>
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                            <Import className="w-6 h-6 text-purple-600" />
                        </div>
                        <CardTitle className="text-xl">Import Private Key</CardTitle>
                        <p className="text-muted-foreground">
                            Import a wallet using a WIF private key
                        </p>
                    </CardHeader>
                </Card>

                {/* Restore from Backup */}
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setStep('backup-file')}>
                    <CardHeader>
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                            <Upload className="w-6 h-6 text-orange-600" />
                        </div>
                        <CardTitle className="text-xl">Restore from Backup</CardTitle>
                        <p className="text-muted-foreground">
                            Import wallet from a backup file or QR codes
                        </p>
                    </CardHeader>
                </Card>
            </div>

            <div className="text-center">
                <Button variant="ghost" onClick={() => setStep('welcome')}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
            </div>
        </div>
    );

    const renderForm = () => (
        <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
                <Button variant="ghost" onClick={() => setStep('method')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <h1 className="text-3xl font-bold mb-2">
                    {formMode === 'create' && 'Create New Wallet'}
                    {formMode === 'importMnemonic' && 'Import from Mnemonic'}
                    {formMode === 'importWIF' && 'Import Private Key'}
                </h1>
            </div>

            <WalletCreationForm
                mode={formMode}
                onSubmit={handleFormSubmit}
                onCancel={() => setStep('method')}
                isSubmitting={isSubmitting}
            />
        </div>
    );

    const renderBackupFile = () => (
        <div className="max-w-lg mx-auto space-y-6">
            <div className="text-center">
                <Button variant="ghost" onClick={() => setStep('method')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <h1 className="text-3xl font-bold mb-2">Restore from Backup</h1>
                <p className="text-muted-foreground">
                    Upload a backup file or scan QR codes to restore your wallet
                </p>
            </div>

            <div className="grid gap-4">
                {/* File Upload */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Upload className="w-5 h-5" />
                            Upload Backup File
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Input
                            type="file"
                            accept=".json"
                            onChange={handleFileSelect}
                            disabled={isSubmitting}
                        />

                        {needsPassword && (
                            <div className="mt-4 space-y-3">
                                <Label htmlFor="backupPassword">Backup Password</Label>
                                <div className="relative">
                                    <Input
                                        id="backupPassword"
                                        type={showBackupPassword ? "text" : "password"}
                                        value={backupPassword}
                                        onChange={(e) => setBackupPassword(e.target.value)}
                                        placeholder="Enter backup password"
                                        className="pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => setShowBackupPassword(!showBackupPassword)}
                                    >
                                        {showBackupPassword ? (
                                            <EyeOff className="h-4 w-4 text-gray-500" />
                                        ) : (
                                            <Eye className="h-4 w-4 text-gray-500" />
                                        )}
                                    </Button>
                                </div>
                                <Button
                                    onClick={handlePasswordRestore}
                                    disabled={!backupPassword || isSubmitting}
                                    className="w-full"
                                >
                                    {isSubmitting ? 'Restoring...' : 'Restore Backup'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* QR Code Import */}
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setShowBackupQRModal(true)}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <QrCode className="w-5 h-5" />
                            Scan QR Codes
                        </CardTitle>
                        <p className="text-muted-foreground">
                            Restore from QR code backup
                        </p>
                    </CardHeader>
                </Card>
            </div>

            <BackupQRModal
                open={showBackupQRModal}
                onClose={() => setShowBackupQRModal(false)}
                mode="restore-only"
            />
        </div>
    );

    const renderSuccess = () => (
        <Card className="max-w-md mx-auto text-center">
            <CardContent className="pt-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Setup Complete!</h2>
                <p className="text-muted-foreground mb-6">
                    Your wallet has been successfully set up. Redirecting to your wallet...
                </p>
                <Button onClick={() => router.push('/')} className="w-full">
                    Continue to Wallet
                </Button>
            </CardContent>
        </Card>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-6 w-6 text-primary" />
                            <span className="text-xl font-bold">Avian Wallet</span>
                        </div>
                        {step !== 'welcome' && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                Step {step === 'method' ? 1 : step === 'form' || step === 'backup-file' ? 2 : 3} of 3
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container max-w-4xl mx-auto px-4 py-8">
                {step === 'welcome' && renderWelcome()}
                {step === 'method' && renderMethodSelection()}
                {step === 'form' && renderForm()}
                {step === 'backup-file' && renderBackupFile()}
                {step === 'success' && renderSuccess()}
            </div>
        </div>
    );
}
