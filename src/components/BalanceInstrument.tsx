'use client';

import React from 'react';
import { RefreshCw, Loader } from 'lucide-react';

/**
 * Animate a number toward `target`, easing from its previous value (0 on first mount) over ~1.2s —
 * the balance "spins up" like an instrument coming online, and eases to each new value after a
 * refresh. Honours prefers-reduced-motion (and Playwright's reduced-motion emulation) by jumping
 * straight to the target.
 */
function useCountUp(target: number): number {
    const [value, setValue] = React.useState(0);
    const fromRef = React.useRef(0);
    const rafRef = React.useRef<number | undefined>(undefined);

    React.useEffect(() => {
        const from = fromRef.current;
        fromRef.current = target;

        const reduce =
            typeof window !== 'undefined' &&
            !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce || from === target || !Number.isFinite(target)) {
            setValue(target);
            return;
        }

        let start: number | null = null;
        const step = (ts: number) => {
            if (start === null) start = ts;
            const t = Math.min((ts - start) / 1200, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(from + (target - from) * eased);
            if (t < 1) rafRef.current = requestAnimationFrame(step);
            else setValue(target);
        };
        rafRef.current = requestAnimationFrame(step);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [target]);

    return value;
}

/**
 * BalanceInstrument — the wallet's primary flight display.
 *
 * An always-dark "cockpit" surface (in both light and dark themes) carrying the
 * balance readout and a mainnet annunciator. The active address is shown in the
 * Wallet card, so it is not repeated here. The state
 * branches (loading / unavailable / stale / processing) and their data-testids
 * are preserved exactly from the original balance card, so the E2E balance
 * contract is unchanged: the figure renders as a single "<value> AVN" text node,
 * and balance-unavailable / balance-stale mark the no-data and last-known cases.
 */

interface ProcessingProgress {
    isProcessing: boolean;
    processed: number;
    total: number;
    currentTx?: string | null;
}

interface BalanceInstrumentProps {
    balance: number;
    balanceStatus: 'live' | 'stale' | 'unknown';
    isLoading: boolean;
    processingProgress: ProcessingProgress;
    isRefreshing: boolean;
    formatBalance: (balance: number) => string;
    onRefresh: () => void;
    onRefreshMouseDown: () => void;
    onRefreshMouseUp: () => void;
    className?: string;
}

export function BalanceInstrument({
    balance,
    balanceStatus,
    isLoading,
    processingProgress,
    isRefreshing,
    formatBalance,
    onRefresh,
    onRefreshMouseDown,
    onRefreshMouseUp,
    className = '',
}: BalanceInstrumentProps) {
    // The figure spins up from 0 on load and eases to each new value after a refresh.
    const displayBalance = useCountUp(balance);

    return (
        <section
            className={`relative overflow-hidden rounded-2xl border border-[#24404A] bg-[linear-gradient(180deg,#163139,#122730)] shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)] ${className}`}
        >
            <div className="relative flex min-h-[176px] flex-col p-6 pb-0">
                {/* sky: label + annunciator + refresh */}
                <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="fd-label text-[#9DB4BC]">Total balance · Mainnet</span>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-[rgba(4,18,26,0.5)] px-2.5 py-1.5">
                            <span className="fd-lamp h-[7px] w-[7px] rounded-full bg-[#34F5C6]" />
                            <span className="fd-label text-[0.6rem] text-[#E6F0F2]">Keys · Local</span>
                        </span>
                        <button
                            onClick={onRefresh}
                            onMouseDown={onRefreshMouseDown}
                            onMouseUp={onRefreshMouseUp}
                            onMouseLeave={onRefreshMouseUp}
                            onTouchStart={onRefreshMouseDown}
                            onTouchEnd={onRefreshMouseUp}
                            disabled={isRefreshing}
                            aria-label="Refresh balance (hold for full refresh)"
                            title="Refresh balance (hold for full refresh)"
                            className="grid h-8 w-8 place-items-center rounded-lg text-[#9DB4BC] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
                        >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* ground band: the horizon line, a night wash, and the readout sitting below the
                    line — metadata reads in the "sky" above, the figure reads in the "ground" below,
                    matching the landing-page PFD. The line spans the full card width and never
                    crosses the number. */}
                <div className="relative -mx-6 mt-auto flex flex-1 flex-col justify-center px-6 pb-6 pt-5">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#34F5C6] opacity-50 shadow-[0_0_12px_rgba(52,245,198,0.4)]"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(26,31,82,0.45),rgba(18,22,58,0.55))]"
                    />
                    <div className="fd-readout fd-glow-teal relative flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold leading-none text-[#34E2D5] md:text-4xl">
                        {isLoading && !processingProgress.isProcessing ? (
                            <span className="text-[#9DB4BC]">Loading…</span>
                        ) : balanceStatus === 'unknown' ? (
                            // No confirmed or cached figure exists; showing 0 here would read as
                            // "your funds are gone" on a flaky connection.
                            <span data-testid="balance-unavailable" className="flex items-baseline text-[#9DB4BC]">
                                —
                                <span className="ml-2 text-xs font-normal opacity-80">balance unavailable</span>
                            </span>
                        ) : (
                            <>
                                <span className="break-all">{`${formatBalance(displayBalance)} AVN`}</span>
                                {balanceStatus === 'stale' && (
                                    <span
                                        data-testid="balance-stale"
                                        className="text-xs font-normal text-[#9DB4BC] opacity-80"
                                        title="Shown from the last successful update; the server has not confirmed it yet"
                                    >
                                        last known
                                    </span>
                                )}
                                {processingProgress.isProcessing && (
                                    <Loader className="h-5 w-5 animate-spin text-[#9DB4BC] opacity-70" />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* history-sync progress: a thin bar pinned to the bottom edge of the card so it signals
                activity without growing the card and pushing the dashboard down. The running count
                still shows in the Transaction History panel. */}
            {processingProgress.isProcessing && processingProgress.total > 0 && (
                <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10"
                    title={`Syncing transaction history ${processingProgress.processed}/${processingProgress.total}`}
                >
                    <div
                        className="h-full bg-[#34F5C6] shadow-[0_0_8px_rgba(52,245,198,0.6)] transition-[width] duration-500 ease-out"
                        style={{
                            width: `${Math.min(100, (processingProgress.processed / processingProgress.total) * 100)}%`,
                        }}
                    />
                </div>
            )}
        </section>
    );
}
