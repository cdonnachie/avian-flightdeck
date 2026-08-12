'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as bip39 from 'bip39';
import { Eye, EyeOff, Copy, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import PasswordStrengthChecker, { PasswordStrength } from '@/components/PasswordStrength';
import type { WalletCreationData } from '@/components/WalletCreationForm';
import { generateWalletName } from '@/lib/walletName';

interface OnboardingCreateWalletProps {
    onSubmit: (data: WalletCreationData) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

type Step = 'details' | 'backup' | 'confirm' | 'secure';
const STEPS: Step[] = ['details', 'backup', 'confirm', 'secure'];
const MIN_PASSWORD_LENGTH = 8;
const CONFIRM_COUNT = 3;

// Preflight-sequence labels shown in the left rail, one per wizard step.
const RAIL: Record<Step, { no: string; title: string; sub: string }> = {
    details: { no: '01', title: 'Identify', sub: 'name & phrase length' },
    backup: { no: '02', title: 'Recovery key', sub: 'write it down' },
    confirm: { no: '03', title: 'Verify', sub: 'confirm the phrase' },
    secure: { no: '04', title: 'Seal', sub: 'set a password' },
};

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

    // Suggest a creative bird-themed name on mount; the user can keep it, edit it, or re-roll.
    // Guard against the async suggestion landing after the user has already typed something.
    const nameTouched = useRef(false);
    useEffect(() => {
        generateWalletName().then((suggested) => {
            if (!nameTouched.current) setName(suggested);
        });
    }, []);

    const rollName = async () => setName(await generateWalletName());

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

    return (
        <div className="ob-console">
            <aside className="ob-rail">
                <div className="ob-label">Sequence</div>
                <ol className="ob-seq">
                    {STEPS.map((s, i) => (
                        <li key={s} className={i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''}>
                            <span className="ob-seq__no">{RAIL[s].no}</span>
                            <span className="ob-seq__t">
                                {RAIL[s].title}
                                <small>{RAIL[s].sub}</small>
                            </span>
                            <span className="ob-seq__dot" />
                        </li>
                    ))}
                </ol>
                <div className="ob-rail__note">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                        <path d="M7 1.5 L13 12 H1 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="M7 6 v3 M7 10.3 v0.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Keys are generated on this device. Nothing here is sent to a server.
                </div>
            </aside>

            <main className="ob-panel">
                <div className="ob-strip" aria-hidden>
                    {STEPS.map((s, i) => (
                        <span key={s} className={i <= stepIndex ? 'on' : ''} />
                    ))}
                </div>

                {/* STEP 1 — details */}
                {step === 'details' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">01 · Identify</span>
                            <h2>Name your wallet</h2>
                        </div>
                        <div className="ob-field">
                            <div className="ob-field__row">
                                <label className="ob-field__lbl" htmlFor="wallet-name">Wallet name</label>
                                <button type="button" className="ob-mini" onClick={rollName}>
                                    <RefreshCw className="h-3.5 w-3.5" /> Suggest
                                </button>
                            </div>
                            <input
                                id="wallet-name"
                                className="ob-input"
                                value={name}
                                onChange={(e) => {
                                    nameTouched.current = true;
                                    setName(e.target.value);
                                }}
                                placeholder="Main Wallet"
                                autoFocus
                                maxLength={50}
                            />
                        </div>
                        <div className="ob-field">
                            <span className="ob-field__lbl">Recovery phrase length</span>
                            <div className="ob-seg">
                                {(['12', '24'] as const).map((len) => (
                                    <button
                                        key={len}
                                        type="button"
                                        className={mnemonicLength === len ? 'is-on' : ''}
                                        onClick={() => setMnemonicLength(len)}
                                    >
                                        {len} words
                                    </button>
                                ))}
                            </div>
                            <span className="ob-hint">
                                Both are secure. 24 words adds margin; 12 is easier to write down.
                            </span>
                        </div>
                    </div>
                )}

                {/* STEP 2 — backup / reveal */}
                {step === 'backup' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">02 · Recovery key</span>
                            <h2>Write these words down, in order</h2>
                        </div>
                        <p className="ob-lede">
                            This phrase is the only way to restore the wallet — FlightDeck can&apos;t
                            recover it for you. Keep it offline.
                        </p>

                        <div className="ob-seedwrap">
                            <div className={`ob-seed${revealed ? '' : ' blur'}`}>
                                {words.map((word, i) => (
                                    <div key={i} className="ob-word">
                                        <i>{i + 1}</i>
                                        <b data-testid="seed-word">{word}</b>
                                    </div>
                                ))}
                            </div>
                            {!revealed && (
                                <button type="button" className="ob-reveal" onClick={() => setRevealed(true)}>
                                    <Eye className="h-4 w-4" /> Tap to reveal
                                </button>
                            )}
                        </div>

                        <div className="ob-warn">
                            <AlertTriangle className="h-4 w-4" />
                            Anyone with these words owns the funds. Never share them, and never type
                            them into a website.
                        </div>

                        {revealed && (
                            <div className="ob-seedbar">
                                <button type="button" className="ob-mini" onClick={copyPhrase}>
                                    <Copy className="h-4 w-4" /> Copy
                                </button>
                                <button
                                    type="button"
                                    className="ob-mini ob-mini--muted"
                                    onClick={() => regenerate(mnemonicLength)}
                                >
                                    <RefreshCw className="h-4 w-4" /> Regenerate
                                </button>
                            </div>
                        )}

                        <label className="ob-arm">
                            <input
                                type="checkbox"
                                checked={writtenDown}
                                disabled={!revealed}
                                onChange={(e) => setWrittenDown(e.target.checked)}
                            />
                            <span>I&apos;ve written my recovery phrase down and stored it safely.</span>
                        </label>
                    </div>
                )}

                {/* STEP 3 — confirm */}
                {step === 'confirm' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">03 · Verify</span>
                            <h2>Confirm your recovery phrase</h2>
                        </div>
                        <p className="ob-lede">
                            Tap the words to fill positions{' '}
                            <b>{positions.map((p) => `#${p + 1}`).join(', ')}</b>, in order.
                        </p>

                        <div className="ob-slots">
                            {positions.map((pos, slot) => {
                                const bankId = assignments[slot];
                                const filled = bankId !== null;
                                return (
                                    <button
                                        key={slot}
                                        type="button"
                                        className={`ob-slot${filled ? ' filled' : ''}`}
                                        onClick={() => clearSlot(slot)}
                                    >
                                        <small data-testid="confirm-slot-pos">#{pos + 1}</small>
                                        <b>{filled ? bank[bankId!].word : '·····'}</b>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="ob-bank">
                            {bank.map((entry) => {
                                const used = assignedIds.has(entry.id);
                                return (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        data-testid="bank-word"
                                        onClick={() => tapWord(entry.id)}
                                        disabled={used}
                                        className={`ob-bankw${used ? ' used' : ''}`}
                                    >
                                        {entry.word}
                                    </button>
                                );
                            })}
                        </div>

                        {assignments.every((a) => a !== null) && !confirmValid && (
                            <p className="ob-err">
                                That order doesn&apos;t match. Tap a slot to clear it and try again.
                            </p>
                        )}
                    </div>
                )}

                {/* STEP 4 — secure */}
                {step === 'secure' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">04 · Seal</span>
                            <h2>Set a password</h2>
                        </div>
                        <p className="ob-lede">
                            This password encrypts the wallet on this device. You&apos;ll enter it to
                            unlock and to authorise signatures.
                        </p>
                        <div className="ob-field">
                            <label className="ob-field__lbl" htmlFor="new-password">Password</label>
                            <div className="ob-inwrap">
                                <input
                                    id="new-password"
                                    className="ob-input"
                                    style={{ paddingRight: 40 }}
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="ob-eye"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <div className="mt-2">
                                <PasswordStrengthChecker
                                    password={password}
                                    onStrengthChange={(s) => setStrength(s)}
                                    showSuggestions={false}
                                />
                            </div>
                        </div>
                        <div className="ob-field">
                            <label className="ob-field__lbl" htmlFor="confirm-password">Confirm password</label>
                            <input
                                id="confirm-password"
                                className="ob-input"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            {confirmPassword.length > 0 && password !== confirmPassword && (
                                <p className="ob-err">Passwords don&apos;t match.</p>
                            )}
                        </div>
                        <div className="ob-note">
                            <ShieldCheck className="h-4 w-4" />
                            <span>
                                Encrypted with scrypt + AES-256-GCM. <b>There&apos;s no reset</b> — if
                                you lose this password, restore from your recovery phrase.
                            </span>
                        </div>
                    </div>
                )}

                {/* nav */}
                <div className="ob-nav">
                    <button
                        type="button"
                        className="ob-btn ob-btn--ghost"
                        onClick={goBack}
                        disabled={isSubmitting}
                    >
                        ← {stepIndex === 0 ? 'Setup' : 'Back'}
                    </button>
                    {step === 'details' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={goNext} disabled={!detailsValid}>
                            Continue →
                        </button>
                    )}
                    {step === 'backup' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={goNext} disabled={!writtenDown}>
                            Continue →
                        </button>
                    )}
                    {step === 'confirm' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={goNext} disabled={!confirmValid}>
                            Continue →
                        </button>
                    )}
                    {step === 'secure' && (
                        <button
                            type="button"
                            className="ob-btn ob-btn--go"
                            onClick={handleCreate}
                            disabled={!passwordValid || isSubmitting}
                        >
                            {isSubmitting ? 'Creating…' : 'Create wallet'}
                        </button>
                    )}
                </div>
            </main>
        </div>
    );
}
