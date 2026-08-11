'use client';

import React from 'react';
import { RefreshCw, Loader, Copy } from 'lucide-react';

/**
 * BalanceInstrument — the wallet's primary flight display.
 *
 * An always-dark "cockpit" surface (in both light and dark themes) carrying the
 * balance readout, a mainnet annunciator, and the receive address. The state
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
    address: string | null;
    isLoading: boolean;
    processingProgress: ProcessingProgress;
    isRefreshing: boolean;
    copied: boolean;
    formatBalance: (balance: number) => string;
    onRefresh: () => void;
    onRefreshMouseDown: () => void;
    onRefreshMouseUp: () => void;
    onCopy: (address: string) => void;
    className?: string;
}

export function BalanceInstrument({
    balance,
    balanceStatus,
    address,
    isLoading,
    processingProgress,
    isRefreshing,
    copied,
    formatBalance,
    onRefresh,
    onRefreshMouseDown,
    onRefreshMouseUp,
    onCopy,
    className = '',
}: BalanceInstrumentProps) {
    return (
        <section
            className={`relative overflow-hidden rounded-2xl border border-[#24404A] bg-[linear-gradient(180deg,#163139,#122730)] shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)] ${className}`}
        >
            {/* artificial-horizon backdrop */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50">
                <div className="absolute inset-x-0 top-0 bottom-[42%] bg-[linear-gradient(180deg,#16525C,#123E46)]" />
                <div className="absolute inset-x-0 top-[58%] bottom-0 bg-[linear-gradient(180deg,#1A1F52,#12163A)]" />
                <div className="absolute inset-x-0 top-[58%] h-0.5 bg-[#34F5C6] opacity-60 shadow-[0_0_12px_rgba(52,245,198,0.5)]" />
            </div>

            <div className="relative p-6">
                {/* top strip: label + annunciator + refresh */}
                <div className="mb-4 flex items-center justify-between gap-3">
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

                {/* readout */}
                <div className="fd-readout fd-glow-teal flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold leading-none text-[#34E2D5] md:text-4xl">
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
                            <span className="break-all">{`${formatBalance(balance)} AVN`}</span>
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

                {/* address + copy */}
                <div className="mt-4 flex items-center gap-1.5 font-mono text-xs text-[#9DB4BC] md:text-sm">
                    <span className="truncate">{address ? address : 'No wallet loaded'}</span>
                    {address && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCopy(address);
                            }}
                            className="flex-shrink-0 rounded p-1 text-[#9DB4BC] transition-colors hover:bg-white/10 hover:text-white"
                            title="Copy address to clipboard"
                        >
                            <Copy size={14} className={copied ? 'text-[#34F5C6]' : ''} />
                        </button>
                    )}
                </div>

                {/* processing progress */}
                {processingProgress.isProcessing && (
                    <div className="mt-4 rounded-lg border border-white/15 bg-white/10 p-2 text-xs text-white">
                        <div className="flex flex-wrap items-center">
                            <Loader className="mr-1.5 h-3 w-3 flex-shrink-0 animate-spin text-white" />
                            <span className="font-medium">
                                Processing… {processingProgress.processed}/{processingProgress.total}
                            </span>
                        </div>
                        {processingProgress.currentTx && (
                            <div className="mt-1 truncate pl-4 text-white/80">
                                TX: {processingProgress.currentTx.slice(0, 6)}…
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
