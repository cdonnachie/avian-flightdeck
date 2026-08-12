'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as bip39 from 'bip39';
import { toast } from 'sonner';
import type { WalletCreationData } from '@/components/WalletCreationForm';
import type { PasswordStrength } from '@/components/PasswordStrength';
import { generateWalletName } from '@/lib/walletName';

/**
 * Headless logic for the guided create-wallet wizard, shared by two skins:
 *  - OnboardingCreateWallet (committed-dark "instrument" look, first-run onboarding), and
 *  - WalletCreationWizard (theme-aware, inside Settings → Wallet Management).
 *
 * The steps and their guarantees — reveal the phrase, then tap-to-confirm it, then set a password —
 * live here so both surfaces behave identically. A wallet is always created from the exact mnemonic
 * the user confirmed.
 */

export type WizardStep = 'details' | 'backup' | 'confirm' | 'secure';
export const WIZARD_STEPS: WizardStep[] = ['details', 'backup', 'confirm', 'secure'];

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

interface UseCreateWalletWizardParams {
    onSubmit: (data: WalletCreationData) => Promise<void>;
    onCancel: () => void;
}

export function useCreateWalletWizard({ onSubmit, onCancel }: UseCreateWalletWizardParams) {
    const [step, setStep] = useState<WizardStep>('details');

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

    const rollName = useCallback(async () => {
        setName(await generateWalletName());
    }, []);

    const onNameChange = useCallback((value: string) => {
        nameTouched.current = true;
        setName(value);
    }, []);

    const stepIndex = WIZARD_STEPS.indexOf(step);

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
    const passwordValid = password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword;

    // ---- confirm interactions ---------------------------------------------
    const assignedIds = useMemo(() => new Set(assignments.filter((x) => x !== null)), [assignments]);

    const tapWord = useCallback(
        (bankId: number) => {
            if (assignedIds.has(bankId)) return;
            const nextEmpty = assignments.indexOf(null);
            if (nextEmpty === -1) return;
            const next = [...assignments];
            next[nextEmpty] = bankId;
            setAssignments(next);
        },
        [assignedIds, assignments],
    );

    const clearSlot = useCallback(
        (slot: number) => {
            if (assignments[slot] === null) return;
            const next = [...assignments];
            next[slot] = null;
            setAssignments(next);
        },
        [assignments],
    );

    const copyPhrase = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(mnemonic);
            toast.warning('Recovery phrase copied', {
                description:
                    'Clear your clipboard afterwards — anything you copy can be read by other apps.',
            });
        } catch {
            toast.error('Could not copy the recovery phrase');
        }
    }, [mnemonic]);

    const handleCreate = useCallback(async () => {
        if (!passwordValid || !confirmValid) return;
        await onSubmit({
            name: name.trim(),
            password,
            mnemonic,
            mnemonicLength,
        });
    }, [passwordValid, confirmValid, onSubmit, name, password, mnemonic, mnemonicLength]);

    const goNext = useCallback(
        () => setStep(WIZARD_STEPS[Math.min(stepIndex + 1, WIZARD_STEPS.length - 1)]),
        [stepIndex],
    );
    const goBack = useCallback(() => {
        if (stepIndex === 0) return onCancel();
        setStep(WIZARD_STEPS[stepIndex - 1]);
    }, [stepIndex, onCancel]);

    return {
        // step
        step,
        stepIndex,
        // details
        name,
        onNameChange,
        rollName,
        mnemonicLength,
        setMnemonicLength,
        // backup
        words,
        revealed,
        setRevealed,
        writtenDown,
        setWrittenDown,
        regenerate,
        copyPhrase,
        // confirm
        positions,
        assignments,
        bank,
        assignedIds,
        tapWord,
        clearSlot,
        confirmValid,
        // secure
        password,
        setPassword,
        confirmPassword,
        setConfirmPassword,
        showPassword,
        setShowPassword,
        strength,
        setStrength,
        // validation + nav
        detailsValid,
        passwordValid,
        goNext,
        goBack,
        handleCreate,
    };
}
