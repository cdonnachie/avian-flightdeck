'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { ArrowLeft, Upload, QrCode, Eye, EyeOff } from 'lucide-react';
import { StorageService } from '@/services/core/StorageService';
import WalletCreationForm, {
    WalletCreationMode,
    WalletCreationData,
} from '@/components/WalletCreationForm';
import OnboardingCreateWallet from '@/components/OnboardingCreateWallet';
import { BackupService } from '@/services/core/BackupService';
import { BackupQRModal } from '@/components/BackupQRModal';
import { ONBOARDING_CSS } from '@/components/onboarding/instrument';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/** Instrument-styled brand mark used across the onboarding shell (matches the landing page). */
function BrandMark() {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ob-brand__mark" src="/logomark-white.svg" alt="Avian" width={28} height={28} />;
}

export default function OnboardingPage() {
    const router = useRouter();
    const { reloadActiveWallet } = useWallet();
    const [step, setStep] = useState<'method' | 'form' | 'backup-file' | 'success'>('method');
    const [formMode, setFormMode] = useState<WalletCreationMode>('create');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showBackupQRModal, setShowBackupQRModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [backupPassword, setBackupPassword] = useState('');
    const [showBackupPassword, setShowBackupPassword] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false);

    // Gate access: terms must be accepted before a wallet can be created, and an existing wallet
    // means onboarding is already done.
    useEffect(() => {
        const checkAccess = async () => {
            // Accepting the license is a precondition for creating or importing a wallet. Send the
            // user to /terms and bring them straight back here once they accept.
            if (typeof window !== 'undefined' && !localStorage.getItem('terms-accepted')) {
                router.push('/terms?next=/onboarding');
                return;
            }

            const walletExists = await StorageService.hasWallet();
            if (walletExists) {
                router.push('/');
            }
        };

        checkAccess();
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
            } else if (formMode === 'importDescriptor') {
                newWallet = await walletService.importWalletFromDescriptor({
                    name: data.name.trim(),
                    descriptor: data.descriptor!.trim(),
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

    const pickImport = (mode: WalletCreationMode) => {
        setFormMode(mode);
        setStep('form');
    };

    // ---- screens -----------------------------------------------------------
    const methodScreen = (
        <div className="ob-panel ob-solo">
            <div className="ob-head">
                <span className="ob-label">Bring a wallet online</span>
                <h1>Create a new wallet, or bring your own keys</h1>
                <p>
                    Everything runs on this device. Start fresh and we&apos;ll generate a recovery
                    phrase, or import one you already hold.
                </p>
            </div>

            <div className="ob-methods">
                <button
                    className="ob-tile ob-tile--go"
                    onClick={() => {
                        setFormMode('create');
                        setStep('form');
                    }}
                >
                    <span className="ob-tile__ic ob-tile__ic--go">
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 5 v14 M5 12 h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </span>
                    <span className="ob-tile__body">
                        <b>Create New Wallet</b>
                        <small>Generate a fresh HD wallet and back up its recovery phrase.</small>
                    </span>
                    <span className="ob-tile__go" aria-hidden>→</span>
                </button>
            </div>

            <div className="ob-methods__sub">
                <div className="ob-label" style={{ marginBottom: 12 }}>Import an existing wallet</div>
                <div className="ob-imports">
                    <button className="ob-irow" onClick={() => pickImport('importMnemonic')}>
                        <span className="ob-lamp ob-lamp--turq" />
                        <span className="ob-irow__t"><b>Recovery phrase</b><small>Restore from a 12 or 24-word phrase</small></span>
                        <span className="ob-irow__go" aria-hidden>→</span>
                    </button>
                    <button className="ob-irow" onClick={() => pickImport('importWIF')}>
                        <span className="ob-lamp ob-lamp--turq" />
                        <span className="ob-irow__t"><b>Private key (WIF)</b><small>Import a single-key wallet</small></span>
                        <span className="ob-irow__go" aria-hidden>→</span>
                    </button>
                    <button className="ob-irow" onClick={() => pickImport('importDescriptor')}>
                        <span className="ob-lamp ob-lamp--indigo" />
                        <span className="ob-irow__t"><b>Output descriptor</b><small>Avian Core v5 script descriptor</small></span>
                        <span className="ob-irow__go" aria-hidden>→</span>
                    </button>
                    <button className="ob-irow" onClick={() => setStep('backup-file')}>
                        <span className="ob-lamp ob-lamp--indigo" />
                        <span className="ob-irow__t"><b>Encrypted backup / QR</b><small>Restore a backup file or scan QR codes</small></span>
                        <span className="ob-irow__go" aria-hidden>→</span>
                    </button>
                </div>
            </div>
        </div>
    );

    const importTitles: Partial<Record<WalletCreationMode, string>> = {
        importMnemonic: 'Import from recovery phrase',
        importWIF: 'Import a private key',
        importDescriptor: 'Import from descriptor',
    };

    const importScreen = (
        <div className="ob-panel ob-solo">
            <button className="ob-mini ob-mini--muted ob-back" onClick={() => setStep('method')}>
                <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="ob-head ob-head--sm">
                <span className="ob-label">Import</span>
                <h2>{importTitles[formMode]}</h2>
            </div>
            <WalletCreationForm
                mode={formMode}
                onSubmit={handleFormSubmit}
                onCancel={() => setStep('method')}
                isSubmitting={isSubmitting}
            />
        </div>
    );

    const restoreScreen = (
        <div className="ob-panel ob-solo">
            <button className="ob-mini ob-mini--muted ob-back" onClick={() => setStep('method')}>
                <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="ob-head ob-head--sm">
                <span className="ob-label">Restore</span>
                <h2>Restore from a backup</h2>
                <p>Upload an encrypted backup file, or scan a set of QR codes.</p>
            </div>

            <div className="ob-restore">
                <div className="ob-restore__file">
                    <div className="ob-field__lbl">
                        <Upload className="inline h-4 w-4 mr-2 -mt-0.5" /> Backup file
                    </div>
                    <Input
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        disabled={isSubmitting}
                        className="ob-file"
                    />

                    {needsPassword && (
                        <div className="mt-4 space-y-3">
                            <Label htmlFor="backupPassword" className="ob-field__lbl">Backup password</Label>
                            <div className="ob-inwrap">
                                <Input
                                    id="backupPassword"
                                    type={showBackupPassword ? 'text' : 'password'}
                                    value={backupPassword}
                                    onChange={(e) => setBackupPassword(e.target.value)}
                                    placeholder="Enter backup password"
                                    className="ob-input pr-10"
                                />
                                <button
                                    type="button"
                                    className="ob-eye"
                                    onClick={() => setShowBackupPassword(!showBackupPassword)}
                                    aria-label={showBackupPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showBackupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <button
                                className="ob-btn ob-btn--go w-full"
                                onClick={handlePasswordRestore}
                                disabled={!backupPassword || isSubmitting}
                            >
                                {isSubmitting ? 'Restoring…' : 'Restore backup'}
                            </button>
                        </div>
                    )}
                </div>

                <button className="ob-irow" onClick={() => setShowBackupQRModal(true)}>
                    <span className="ob-tile__ic"><QrCode className="h-5 w-5" /></span>
                    <span className="ob-irow__t"><b>Scan QR codes</b><small>Restore from a QR code backup</small></span>
                    <span className="ob-irow__go" aria-hidden>→</span>
                </button>
            </div>

            <BackupQRModal
                open={showBackupQRModal}
                onClose={() => setShowBackupQRModal(false)}
                mode="restore-only"
            />
        </div>
    );

    const successScreen = (
        <div className="ob-panel ob-solo ob-done">
            <div className="ob-done__badge">
                <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 12.5 l5 5 L20 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>
            <h2>Wallet armed</h2>
            <p className="ob-lede ob-done__lede">
                Your keys are generated, encrypted, and stored on this device. You have control.
            </p>
            <div className="ob-done__sign"><span className="ob-lamp" /> SYSTEMS NOMINAL</div>
            <button className="ob-btn ob-btn--go" onClick={() => router.push('/')}>
                Enter FlightDeck →
            </button>
        </div>
    );

    return (
        <div className="ob dark">
            <style>{ONBOARDING_CSS}</style>

            <div className="ob-top">
                <div className="ob-wrap ob-top__row">
                    <div className="ob-brand">
                        <BrandMark />
                        <span className="ob-brand__name">AVIAN <b>FLIGHTDECK</b></span>
                    </div>
                    <div className="ob-top__tag"><span className="ob-lamp" /> PREFLIGHT SEQUENCE</div>
                </div>
            </div>

            <div className="ob-wrap ob-stage">
                {step === 'method' && methodScreen}
                {step === 'form' && formMode === 'create' && (
                    <OnboardingCreateWallet
                        onSubmit={handleFormSubmit}
                        onCancel={() => setStep('method')}
                        isSubmitting={isSubmitting}
                    />
                )}
                {step === 'form' && formMode !== 'create' && importScreen}
                {step === 'backup-file' && restoreScreen}
                {step === 'success' && successScreen}
            </div>
        </div>
    );
}
