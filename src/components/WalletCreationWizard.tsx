'use client';

import {
    Eye,
    EyeOff,
    Copy,
    RefreshCw,
    AlertTriangle,
    ShieldCheck,
    ArrowLeft,
    ArrowRight,
    Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordStrengthChecker from '@/components/PasswordStrength';
import type { WalletCreationData } from '@/components/WalletCreationForm';
import { useCreateWalletWizard, WIZARD_STEPS, WizardStep } from '@/hooks/useCreateWalletWizard';

interface WalletCreationWizardProps {
    onSubmit: (data: WalletCreationData) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

const TITLES: Record<WizardStep, { title: string; sub: string }> = {
    details: { title: 'Create a new wallet', sub: 'A fresh HD wallet, generated and encrypted on this device.' },
    backup: { title: 'Back up your recovery phrase', sub: 'Write it down before continuing — it can’t be recovered for you.' },
    confirm: { title: 'Confirm your recovery phrase', sub: 'Prove you saved the backup by re-entering the requested words.' },
    secure: { title: 'Set a password', sub: 'Encrypts this wallet on your device.' },
};

/**
 * Theme-aware skin of the guided create-wallet wizard, used inside Settings → Wallet Management.
 * Shares all logic with the onboarding wizard via useCreateWalletWizard; only the presentation
 * differs (it follows the app's light/dark theme rather than the committed-dark instrument look).
 */
export default function WalletCreationWizard({
    onSubmit,
    onCancel,
    isSubmitting,
}: WalletCreationWizardProps) {
    const w = useCreateWalletWizard({ onSubmit, onCancel });
    const title = TITLES[w.step];

    return (
        <div>
            {/* header */}
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-foreground">{title.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{title.sub}</p>
                </div>
                <span className="flex-none whitespace-nowrap rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Step {w.stepIndex + 1} of 4
                </span>
            </div>

            {/* progress */}
            <div className="mb-6 flex gap-1.5" aria-hidden>
                {WIZARD_STEPS.map((s, i) => (
                    <span
                        key={s}
                        className={`h-1 flex-1 rounded-full transition-colors ${i <= w.stepIndex ? 'bg-primary' : 'bg-muted'}`}
                    />
                ))}
            </div>

            {/* STEP 1 — details */}
            {w.step === 'details' && (
                <div className="space-y-5">
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <Label htmlFor="wcw-name">Wallet name</Label>
                            <button
                                type="button"
                                onClick={w.rollName}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80"
                            >
                                <RefreshCw className="h-3.5 w-3.5" /> Suggest
                            </button>
                        </div>
                        <Input
                            id="wcw-name"
                            value={w.name}
                            onChange={(e) => w.onNameChange(e.target.value)}
                            placeholder="Main Wallet"
                            maxLength={50}
                            autoFocus
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Creative bird-themed name — keep it or customize your own.
                        </p>
                    </div>
                    <div>
                        <Label className="mb-2 block">Recovery phrase length</Label>
                        <div className="flex gap-1.5 rounded-lg border border-input bg-background p-1">
                            {(['12', '24'] as const).map((len) => (
                                <button
                                    key={len}
                                    type="button"
                                    onClick={() => w.setMnemonicLength(len)}
                                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                                        w.mnemonicLength === len
                                            ? 'bg-primary/15 text-primary'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {len} words
                                </button>
                            ))}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Both are secure. 24 words adds margin; 12 is easier to write down.
                        </p>
                    </div>
                </div>
            )}

            {/* STEP 2 — backup / reveal */}
            {w.step === 'backup' && (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Write these {w.words.length} words down in order and keep them offline. This
                        phrase is the only way to restore the wallet — it can&apos;t be recovered for you.
                    </p>

                    <div className="relative">
                        <div
                            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${w.revealed ? '' : 'select-none blur-sm'}`}
                        >
                            {w.words.map((word, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                                >
                                    <span className="w-5 text-right font-mono text-xs text-muted-foreground">
                                        {i + 1}
                                    </span>
                                    <span className="font-mono text-sm" data-testid="seed-word">
                                        {word}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {!w.revealed && (
                            <button
                                type="button"
                                onClick={() => w.setRevealed(true)}
                                className="absolute inset-0 grid place-items-center"
                            >
                                <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-sm">
                                    <Eye className="h-4 w-4 text-primary" /> Tap to reveal
                                </span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-start gap-2.5 rounded-lg border border-caution/30 bg-caution/10 p-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-caution" />
                        <span>
                            Anyone with these words owns the funds. Never share them, and never type
                            them into a website.
                        </span>
                    </div>

                    {w.revealed && (
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="sm" onClick={w.copyPhrase} className="gap-2">
                                <Copy className="h-4 w-4" /> Copy
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => w.regenerate(w.mnemonicLength)}
                                className="gap-2 text-muted-foreground"
                            >
                                <RefreshCw className="h-4 w-4" /> Regenerate
                            </Button>
                        </div>
                    )}

                    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input
                            type="checkbox"
                            checked={w.writtenDown}
                            disabled={!w.revealed}
                            onChange={(e) => w.setWrittenDown(e.target.checked)}
                            className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50"
                        />
                        <span className={w.revealed ? '' : 'text-muted-foreground'}>
                            I&apos;ve written my recovery phrase down and stored it safely.
                        </span>
                    </label>
                </div>
            )}

            {/* STEP 3 — confirm */}
            {w.step === 'confirm' && (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Tap the words to fill positions{' '}
                        <span className="font-medium text-foreground">
                            {w.positions.map((p) => `#${p + 1}`).join(', ')}
                        </span>{' '}
                        in order, to confirm your backup.
                    </p>

                    <div className="flex gap-2">
                        {w.positions.map((pos, slot) => {
                            const bankId = w.assignments[slot];
                            const filled = bankId !== null;
                            return (
                                <button
                                    key={slot}
                                    type="button"
                                    onClick={() => w.clearSlot(slot)}
                                    className={`flex-1 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                                        filled ? 'border-primary bg-primary/10' : 'border-dashed border-border'
                                    }`}
                                >
                                    <span className="block text-[0.6rem] text-muted-foreground" data-testid="confirm-slot-pos">
                                        #{pos + 1}
                                    </span>
                                    <span className="font-mono text-sm">
                                        {filled ? w.bank[bankId!].word : '·····'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {w.bank.map((entry) => {
                            const used = w.assignedIds.has(entry.id);
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    data-testid="bank-word"
                                    onClick={() => w.tapWord(entry.id)}
                                    disabled={used}
                                    className={`rounded-md border px-3 py-1.5 font-mono text-sm transition-colors ${
                                        used
                                            ? 'border-border bg-muted/40 text-muted-foreground opacity-50'
                                            : 'border-border hover:border-primary hover:text-primary'
                                    }`}
                                >
                                    {entry.word}
                                </button>
                            );
                        })}
                    </div>

                    {w.assignments.every((a) => a !== null) && !w.confirmValid && (
                        <p className="text-sm text-destructive">
                            That order doesn&apos;t match. Tap a slot to clear it and try again.
                        </p>
                    )}
                </div>
            )}

            {/* STEP 4 — secure */}
            {w.step === 'secure' && (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This password encrypts the wallet on this device. You&apos;ll enter it to unlock
                        and to authorise signatures.
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="wcw-password">Password</Label>
                        <div className="relative">
                            <Input
                                id="wcw-password"
                                type={w.showPassword ? 'text' : 'password'}
                                value={w.password}
                                onChange={(e) => w.setPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                autoComplete="new-password"
                                className="pr-10"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => w.setShowPassword((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label={w.showPassword ? 'Hide password' : 'Show password'}
                            >
                                {w.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <PasswordStrengthChecker
                            password={w.password}
                            onStrengthChange={(s) => w.setStrength(s)}
                            showSuggestions={false}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="wcw-confirm">Confirm password</Label>
                        <Input
                            id="wcw-confirm"
                            type={w.showPassword ? 'text' : 'password'}
                            value={w.confirmPassword}
                            onChange={(e) => w.setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                        {w.confirmPassword.length > 0 && w.password !== w.confirmPassword && (
                            <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
                        )}
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
                        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                        <span>
                            Encrypted locally with AES-256-GCM using a key derived from your password
                            with Argon2id — your password never leaves this device.{' '}
                            <b className="text-primary">There&apos;s no reset</b>: if you lose it,
                            restore from your recovery phrase.
                        </span>
                    </div>
                </div>
            )}

            {/* nav */}
            <div className="mt-6 flex gap-2 border-t border-border pt-5">
                <Button variant="ghost" onClick={w.goBack} disabled={isSubmitting} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> {w.stepIndex === 0 ? 'Cancel' : 'Back'}
                </Button>
                {w.step === 'details' && (
                    <Button onClick={w.goNext} disabled={!w.detailsValid} className="ml-auto gap-2">
                        Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
                {w.step === 'backup' && (
                    <Button onClick={w.goNext} disabled={!w.writtenDown} className="ml-auto gap-2">
                        Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
                {w.step === 'confirm' && (
                    <Button onClick={w.goNext} disabled={!w.confirmValid} className="ml-auto gap-2">
                        Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
                {w.step === 'secure' && (
                    <Button
                        onClick={w.handleCreate}
                        disabled={!w.passwordValid || isSubmitting}
                        className="ml-auto gap-2"
                    >
                        <Lock className="h-4 w-4" />
                        {isSubmitting ? 'Creating…' : 'Create wallet'}
                    </Button>
                )}
            </div>
        </div>
    );
}
