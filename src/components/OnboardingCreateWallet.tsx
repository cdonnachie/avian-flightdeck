'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as bip39 from 'bip39';
import {
    ArrowLeft,
    ArrowRight,
    Eye,
    EyeOff,
    Copy,
    Check,
    RefreshCw,
    ShieldCheck,
    AlertTriangle,
    Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordStrengthChecker, { PasswordStrength } from '@/components/PasswordStrength';
import type { WalletCreationData } from '@/components/WalletCreationForm';

interface OnboardingCreateWalletProps {
    onSubmit: (data: WalletCreationData) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

type Step = 'details' | 'backup' | 'confirm' | 'secure';
const STEPS: Step[] = ['details', 'backup', 'confirm', 'secure'];
const MIN_PASSWORD_LENGTH = 8;
const CONFIRM_COUNT = 3;

// Fisher–Yates shuffle (app runtime; deterministic randomness not required here).
function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Pick `count` distinct indices from [0, length).
function pickPositions(length: number, count: number): number[] {
    const idx = shuffle(Array.from({ length }, (_, i) => i)).slice(0, count);
    return idx.sort((a, b) => a - b);
}

export default function OnboardingCreateWallet({
    onSubmit,
    onCancel,
    isSubmitting,
}: OnboardingCreateWalletProps) {
    const [step, setStep] = useState<Step>('details');

    // details
    const [name, setName] = useState('');
    const [mnemonicLength, setMnemonicLength] = useState<'12' | '24'>('12');

    // backup
    const [mnemonic, setMnemonic] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [writtenDown, setWrittenDown] = useState(false);

    // confirm
    const [positions, setPositions] = useState<number[]>([]);
    // slot -> bank entry id (index into `bank`), or null
    const [assignments, setAssignments] = useState<(number | null)[]>([]);

    // secure
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [strength, setStrength] = useState<PasswordStrength>(null);

    const words = useMemo(() => (mnemonic ? mnemonic.trim().split(/\s+/) : []), [mnemonic]);

    // Word bank for the confirm step: every mnemonic word, shuffled, then given an id equal to its
    // position in the shuffled array — so `bank[id]` resolves to the same entry the button rendered.
    const bank = useMemo(
        () => shuffle(words).map((word, id) => ({ id, word })),
        // Re-shuffle only when the mnemonic itself changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mnemonic],
    );

    const regenerate = useCallback((length: '12' | '24') => {
        const entropyBits = length === '24' ? 256 : 128;
        const next = bip39.generateMnemonic(entropyBits);
        setMnemonic(next);
        setRevealed(false);
        setWrittenDown(false);
        const wordCount = length === '24' ? 24 : 12;
        setPositions(pickPositions(wordCount, CONFIRM_COUNT));
        setAssignments(Array(CONFIRM_COUNT).fill(null));
    }, []);

    // Generate on mount and whenever the requested length changes.
    useEffect(() => {
        regenerate(mnemonicLength);
    }, [mnemonicLength, regenerate]);

    const stepIndex = STEPS.indexOf(step);

    // ---- validation --------------------------------------------------------
    const detailsValid = name.trim().length > 0;
    const confirmValid = useMemo(
        () =>
            assignments.length === positions.length &&
            assignments.every(
                (bankId, slot) => bankId !== null && bank[bankId]?.word === words[positions[slot]],
            ),
        [assignments, positions, bank, words],
    );
    const passwordValid =
        password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword;

    // ---- confirm interactions ---------------------------------------------
    const assignedIds = useMemo(() => new Set(assignments.filter((x) => x !== null)), [assignments]);

    const tapWord = (bankId: number) => {
        if (assignedIds.has(bankId)) return;
        const nextEmpty = assignments.indexOf(null);
        if (nextEmpty === -1) return;
        const next = [...assignments];
        next[nextEmpty] = bankId;
        setAssignments(next);
    };

    const clearSlot = (slot: number) => {
        if (assignments[slot] === null) return;
        const next = [...assignments];
        next[slot] = null;
        setAssignments(next);
    };

    const copyPhrase = async () => {
        try {
            await navigator.clipboard.writeText(mnemonic);
            toast.warning('Recovery phrase copied', {
                description:
                    'Clear your clipboard afterwards — anything you copy can be read by other apps.',
            });
        } catch {
            toast.error('Could not copy the recovery phrase');
        }
    };

    const handleCreate = async () => {
        if (!passwordValid || !confirmValid) return;
        await onSubmit({
            name: name.trim(),
            password,
            mnemonic,
            mnemonicLength,
        });
    };

    const goNext = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
    const goBack = () => {
        if (stepIndex === 0) return onCancel();
        setStep(STEPS[stepIndex - 1]);
    };

    // ---- render helpers ----------------------------------------------------
    const titles: Record<Step, string> = {
        details: 'Name your wallet',
        backup: 'Back up your recovery phrase',
        confirm: 'Confirm your recovery phrase',
        secure: 'Set a password',
    };

    return (
        <Card className="max-w-lg mx-auto">
            <CardHeader className="space-y-3">
                {/* progress */}
                <div className="flex items-center gap-1.5" aria-hidden>
                    {STEPS.map((s, i) => (
                        <span
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
                        />
                    ))}
                </div>
                <CardTitle className="text-xl">{titles[step]}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* STEP 1 — details */}
                {step === 'details' && (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="wallet-name">Wallet name</Label>
                            <Input
                                id="wallet-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Main Wallet"
                                autoFocus
                                maxLength={50}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Recovery phrase length</Label>
                            <div className="flex gap-2 rounded-lg border border-input bg-background p-1">
                                {(['12', '24'] as const).map((len) => (
                                    <button
                                        key={len}
                                        type="button"
                                        onClick={() => setMnemonicLength(len)}
                                        className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                                            mnemonicLength === len
                                                ? 'bg-primary/15 text-primary'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {len} words
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Both are secure. 24 words offers extra margin; 12 is easier to write down.
                            </p>
                        </div>
                    </div>
                )}

                {/* STEP 2 — backup / reveal */}
                {step === 'backup' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Write these {words.length} words down in order and keep them offline. They are
                            the only way to restore this wallet — FlightDeck can&apos;t recover them for you.
                        </p>

                        <div className="relative">
                            <div
                                className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${revealed ? '' : 'select-none blur-sm'}`}
                            >
                                {words.map((word, i) => (
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
                            {!revealed && (
                                <button
                                    type="button"
                                    onClick={() => setRevealed(true)}
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
                                Anyone with these words owns the funds. Never share them, and never type them
                                into a website.
                            </span>
                        </div>

                        {revealed && (
                            <div className="flex items-center justify-between">
                                <Button variant="ghost" size="sm" onClick={copyPhrase} className="gap-2">
                                    <Copy className="h-4 w-4" /> Copy
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => regenerate(mnemonicLength)}
                                    className="gap-2 text-muted-foreground"
                                >
                                    <RefreshCw className="h-4 w-4" /> Regenerate
                                </Button>
                            </div>
                        )}

                        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                            <input
                                type="checkbox"
                                checked={writtenDown}
                                disabled={!revealed}
                                onChange={(e) => setWrittenDown(e.target.checked)}
                                className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50"
                            />
                            <span className={revealed ? '' : 'text-muted-foreground'}>
                                I&apos;ve written my recovery phrase down and stored it safely.
                            </span>
                        </label>
                    </div>
                )}

                {/* STEP 3 — confirm */}
                {step === 'confirm' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Tap the words to fill positions{' '}
                            <span className="font-medium text-foreground">
                                {positions.map((p) => `#${p + 1}`).join(', ')}
                            </span>{' '}
                            in order, to confirm your backup.
                        </p>

                        <div className="flex gap-2">
                            {positions.map((pos, slot) => {
                                const bankId = assignments[slot];
                                const filled = bankId !== null;
                                return (
                                    <button
                                        key={slot}
                                        type="button"
                                        onClick={() => clearSlot(slot)}
                                        className={`flex-1 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                                            filled
                                                ? 'border-primary bg-primary/10'
                                                : 'border-dashed border-border'
                                        }`}
                                    >
                                        <span
                                            className="block text-[0.6rem] text-muted-foreground"
                                            data-testid="confirm-slot-pos"
                                        >
                                            #{pos + 1}
                                        </span>
                                        <span className="font-mono text-sm">
                                            {filled ? bank[bankId!].word : '·····'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {bank.map((entry) => {
                                const used = assignedIds.has(entry.id);
                                return (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        data-testid="bank-word"
                                        onClick={() => tapWord(entry.id)}
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

                        {assignments.every((a) => a !== null) && !confirmValid && (
                            <p className="text-sm text-destructive">
                                That order doesn&apos;t match. Tap a slot to clear it and try again.
                            </p>
                        )}
                    </div>
                )}

                {/* STEP 4 — secure */}
                {step === 'secure' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            This password encrypts the wallet on this device. You&apos;ll enter it to unlock
                            and to authorise signatures.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    className="pr-10"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <PasswordStrengthChecker
                                password={password}
                                onStrengthChange={(s) => setStrength(s)}
                                showSuggestions={false}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm password</Label>
                            <Input
                                id="confirm-password"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            {confirmPassword.length > 0 && password !== confirmPassword && (
                                <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
                            )}
                        </div>
                        <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
                            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                            <span>
                                Encrypted with scrypt + AES-256-GCM.{' '}
                                <b className="text-primary">There&apos;s no reset</b> — if you lose this
                                password, restore from your recovery phrase.
                            </span>
                        </div>
                    </div>
                )}

                {/* nav */}
                <div className="flex gap-2 pt-1">
                    <Button variant="ghost" onClick={goBack} disabled={isSubmitting} className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    {step === 'details' && (
                        <Button onClick={goNext} disabled={!detailsValid} className="ml-auto gap-2">
                            Continue <ArrowRight className="h-4 w-4" />
                        </Button>
                    )}
                    {step === 'backup' && (
                        <Button onClick={goNext} disabled={!writtenDown} className="ml-auto gap-2">
                            Continue <ArrowRight className="h-4 w-4" />
                        </Button>
                    )}
                    {step === 'confirm' && (
                        <Button onClick={goNext} disabled={!confirmValid} className="ml-auto gap-2">
                            Continue <ArrowRight className="h-4 w-4" />
                        </Button>
                    )}
                    {step === 'secure' && (
                        <Button
                            onClick={handleCreate}
                            disabled={!passwordValid || isSubmitting}
                            className="ml-auto gap-2"
                        >
                            <Lock className="h-4 w-4" />
                            {isSubmitting ? 'Creating…' : 'Create wallet'}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
