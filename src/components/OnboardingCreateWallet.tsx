'use client';

import { Eye, EyeOff, Copy, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import PasswordStrengthChecker from '@/components/PasswordStrength';
import type { WalletCreationData } from '@/components/WalletCreationForm';
import { useCreateWalletWizard, WIZARD_STEPS, WizardStep } from '@/hooks/useCreateWalletWizard';

interface OnboardingCreateWalletProps {
    onSubmit: (data: WalletCreationData) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
}

// Preflight-sequence labels shown in the left rail, one per wizard step.
const RAIL: Record<WizardStep, { no: string; title: string; sub: string }> = {
    details: { no: '01', title: 'Identify', sub: 'name & phrase length' },
    backup: { no: '02', title: 'Recovery key', sub: 'write it down' },
    confirm: { no: '03', title: 'Verify', sub: 'confirm the phrase' },
    secure: { no: '04', title: 'Seal', sub: 'set a password' },
};

/** Committed-dark "instrument" skin of the guided create-wallet wizard, used in onboarding. */
export default function OnboardingCreateWallet({
    onSubmit,
    onCancel,
    isSubmitting,
}: OnboardingCreateWalletProps) {
    const w = useCreateWalletWizard({ onSubmit, onCancel });

    return (
        <div className="ob-console">
            <aside className="ob-rail">
                <div className="ob-label">Sequence</div>
                <ol className="ob-seq">
                    {WIZARD_STEPS.map((s, i) => (
                        <li
                            key={s}
                            className={i === w.stepIndex ? 'active' : i < w.stepIndex ? 'done' : ''}
                        >
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
                    {WIZARD_STEPS.map((s, i) => (
                        <span key={s} className={i <= w.stepIndex ? 'on' : ''} />
                    ))}
                </div>

                {/* STEP 1 — details */}
                {w.step === 'details' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">01 · Identify</span>
                            <h2>Name your wallet</h2>
                        </div>
                        <div className="ob-field">
                            <div className="ob-field__row">
                                <label className="ob-field__lbl" htmlFor="wallet-name">Wallet name</label>
                                <button type="button" className="ob-mini" onClick={w.rollName}>
                                    <RefreshCw className="h-3.5 w-3.5" /> Suggest
                                </button>
                            </div>
                            <input
                                id="wallet-name"
                                className="ob-input"
                                value={w.name}
                                onChange={(e) => w.onNameChange(e.target.value)}
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
                                        className={w.mnemonicLength === len ? 'is-on' : ''}
                                        onClick={() => w.setMnemonicLength(len)}
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
                {w.step === 'backup' && (
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
                            <div className={`ob-seed${w.revealed ? '' : ' blur'}`}>
                                {w.words.map((word, i) => (
                                    <div key={i} className="ob-word">
                                        <i>{i + 1}</i>
                                        <b data-testid="seed-word">{word}</b>
                                    </div>
                                ))}
                            </div>
                            {!w.revealed && (
                                <button type="button" className="ob-reveal" onClick={() => w.setRevealed(true)}>
                                    <Eye className="h-4 w-4" /> Tap to reveal
                                </button>
                            )}
                        </div>

                        <div className="ob-warn">
                            <AlertTriangle className="h-4 w-4" />
                            Anyone with these words owns the funds. Never share them, and never type
                            them into a website.
                        </div>

                        {w.revealed && (
                            <div className="ob-seedbar">
                                <button type="button" className="ob-mini" onClick={w.copyPhrase}>
                                    <Copy className="h-4 w-4" /> Copy
                                </button>
                                <button
                                    type="button"
                                    className="ob-mini ob-mini--muted"
                                    onClick={() => w.regenerate(w.mnemonicLength)}
                                >
                                    <RefreshCw className="h-4 w-4" /> Regenerate
                                </button>
                            </div>
                        )}

                        <label className="ob-arm">
                            <input
                                type="checkbox"
                                checked={w.writtenDown}
                                disabled={!w.revealed}
                                onChange={(e) => w.setWrittenDown(e.target.checked)}
                            />
                            <span>I&apos;ve written my recovery phrase down and stored it safely.</span>
                        </label>
                    </div>
                )}

                {/* STEP 3 — confirm */}
                {w.step === 'confirm' && (
                    <div>
                        <div className="ob-head ob-head--sm">
                            <span className="ob-label">03 · Verify</span>
                            <h2>Confirm your recovery phrase</h2>
                        </div>
                        <p className="ob-lede">
                            Tap the words to fill positions{' '}
                            <b>{w.positions.map((p) => `#${p + 1}`).join(', ')}</b>, in order.
                        </p>

                        <div className="ob-slots">
                            {w.positions.map((pos, slot) => {
                                const bankId = w.assignments[slot];
                                const filled = bankId !== null;
                                return (
                                    <button
                                        key={slot}
                                        type="button"
                                        className={`ob-slot${filled ? ' filled' : ''}`}
                                        onClick={() => w.clearSlot(slot)}
                                    >
                                        <small data-testid="confirm-slot-pos">#{pos + 1}</small>
                                        <b>{filled ? w.bank[bankId!].word : '·····'}</b>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="ob-bank">
                            {w.bank.map((entry) => {
                                const used = w.assignedIds.has(entry.id);
                                return (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        data-testid="bank-word"
                                        onClick={() => w.tapWord(entry.id)}
                                        disabled={used}
                                        className={`ob-bankw${used ? ' used' : ''}`}
                                    >
                                        {entry.word}
                                    </button>
                                );
                            })}
                        </div>

                        {w.assignments.every((a) => a !== null) && !w.confirmValid && (
                            <p className="ob-err">
                                That order doesn&apos;t match. Tap a slot to clear it and try again.
                            </p>
                        )}
                    </div>
                )}

                {/* STEP 4 — secure */}
                {w.step === 'secure' && (
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
                                    type={w.showPassword ? 'text' : 'password'}
                                    value={w.password}
                                    onChange={(e) => w.setPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="ob-eye"
                                    onClick={() => w.setShowPassword((v) => !v)}
                                    aria-label={w.showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {w.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <div className="mt-2">
                                <PasswordStrengthChecker
                                    password={w.password}
                                    onStrengthChange={(s) => w.setStrength(s)}
                                    showSuggestions={false}
                                />
                            </div>
                        </div>
                        <div className="ob-field">
                            <label className="ob-field__lbl" htmlFor="confirm-password">Confirm password</label>
                            <input
                                id="confirm-password"
                                className="ob-input"
                                type={w.showPassword ? 'text' : 'password'}
                                value={w.confirmPassword}
                                onChange={(e) => w.setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            {w.confirmPassword.length > 0 && w.password !== w.confirmPassword && (
                                <p className="ob-err">Passwords don&apos;t match.</p>
                            )}
                        </div>
                        <div className="ob-note">
                            <ShieldCheck className="h-4 w-4" />
                            <span>
                                Encrypted locally with AES-256-GCM using a key derived from your
                                password with scrypt — your password never leaves this device.{' '}
                                <b>There&apos;s no reset</b>: if you lose it, restore from your
                                recovery phrase.
                            </span>
                        </div>
                    </div>
                )}

                {/* nav */}
                <div className="ob-nav">
                    <button
                        type="button"
                        className="ob-btn ob-btn--ghost"
                        onClick={w.goBack}
                        disabled={isSubmitting}
                    >
                        ← {w.stepIndex === 0 ? 'Setup' : 'Back'}
                    </button>
                    {w.step === 'details' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={w.goNext} disabled={!w.detailsValid}>
                            Continue →
                        </button>
                    )}
                    {w.step === 'backup' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={w.goNext} disabled={!w.writtenDown}>
                            Continue →
                        </button>
                    )}
                    {w.step === 'confirm' && (
                        <button type="button" className="ob-btn ob-btn--go" onClick={w.goNext} disabled={!w.confirmValid}>
                            Continue →
                        </button>
                    )}
                    {w.step === 'secure' && (
                        <button
                            type="button"
                            className="ob-btn ob-btn--go"
                            onClick={w.handleCreate}
                            disabled={!w.passwordValid || isSubmitting}
                        >
                            {isSubmitting ? 'Creating…' : 'Create wallet'}
                        </button>
                    )}
                </div>
            </main>
        </div>
    );
}
