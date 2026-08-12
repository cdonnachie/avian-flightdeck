'use client';

import React from 'react';
import { ArrowRight, Lock, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface SendReviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    onEditInputs: () => void;
    isSending: boolean;
    amount: string;
    toAddress: string;
    feeAVN: string;
    totalAVN: string;
    recipientReceivesAVN: string;
    subtractFee: boolean;
    inputsLabel: string;
    changeAddress?: string;
    fromLabel?: string;
}

const shorten = (a: string) => (a.length > 24 ? `${a.slice(0, 12)}…${a.slice(-10)}` : a);

export default function SendReviewDialog({
    open,
    onOpenChange,
    onConfirm,
    onEditInputs,
    isSending,
    amount,
    toAddress,
    feeAVN,
    totalAVN,
    recipientReceivesAVN,
    subtractFee,
    inputsLabel,
    changeAddress,
    fromLabel,
}: SendReviewDialogProps) {
    const isMobile = useMediaQuery('(max-width: 768px)');

    const body = (
        <div className="space-y-4">
            {/* hero */}
            <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
                <span className="fd-label block text-muted-foreground">You&apos;re sending</span>
                <div className="fd-readout mt-2 text-3xl font-semibold text-primary">
                    {amount} <span className="text-lg text-muted-foreground">AVN</span>
                </div>
            </div>

            {/* to */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <ArrowRight className="h-3.5 w-3.5 text-primary" /> To recipient
            </div>
            <div className="break-all rounded-md border border-border bg-muted/20 p-3 font-mono text-sm">
                {toAddress}
            </div>

            {/* breakdown */}
            <div className="rounded-lg border border-border">
                <Row k="Amount" v={`${amount} AVN`} />
                <Row k="Network fee" v={`≈ ${feeAVN} AVN`} />
                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">Inputs</span>
                    <span className="flex items-center gap-2">
                        <span className="font-mono">{inputsLabel}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs text-primary"
                            onClick={onEditInputs}
                        >
                            <SlidersHorizontal className="h-3 w-3" /> Change
                        </Button>
                    </span>
                </div>
                {changeAddress && <Row k="Change address" v={shorten(changeAddress)} mono />}
                {fromLabel && <Row k="From" v={fromLabel} />}
                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-3 text-sm">
                    <span className="font-medium">Total</span>
                    <span className="font-mono text-base font-semibold">{totalAVN} AVN</span>
                </div>
            </div>

            {subtractFee && (
                <p className="text-xs text-muted-foreground">
                    The network fee is taken from the amount — the recipient receives{' '}
                    <span className="font-mono text-foreground">{recipientReceivesAVN} AVN</span>.
                </p>
            )}

            {/* reassurance */}
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>
                    Confirming opens authentication — nothing is signed or broadcast until you authorise.
                </span>
            </div>

            {/* actions */}
            <div className="flex gap-2 pt-1">
                <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={isSending}
                >
                    Back
                </Button>
                <Button type="button" className="flex-1 gap-2" onClick={onConfirm} disabled={isSending}>
                    <Lock className="h-4 w-4" />
                    {isSending ? 'Sending…' : 'Confirm & authorise'}
                </Button>
            </div>
        </div>
    );

    const title = 'Review transaction';
    const description = 'Check the details before you authorise the send.';

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent className="max-h-[95vh]">
                    <DrawerHeader className="text-left">
                        <DrawerTitle>{title}</DrawerTitle>
                        <DrawerDescription>{description}</DrawerDescription>
                    </DrawerHeader>
                    <div className="overflow-y-auto px-4 pb-6">{body}</div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {body}
            </DialogContent>
        </Dialog>
    );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-sm first:border-t-0">
            <span className="text-muted-foreground">{k}</span>
            <span className={mono ? 'font-mono' : ''}>{v}</span>
        </div>
    );
}
