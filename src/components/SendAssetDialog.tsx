'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Coins, Lock, ShieldAlert } from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { WalletService } from '@/services/wallet/WalletService';
import { formatAssetAmount, parseAssetAmount, type HeldAsset } from '@/services/wallet/AssetService';
import { getExplorerUrl } from '@/lib/explorer';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SendAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: HeldAsset | null;
  onSuccess?: () => void;
}

/** Assets live on legacy P2PKH (R…) addresses only — never bech32. */
const isLegacyAddress = (a: string) =>
  /^R[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{25,34}$/.test(a.trim());

export default function SendAssetDialog({
  open,
  onOpenChange,
  asset,
  onSuccess,
}: SendAssetDialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { electrum, isConnected, refreshAfterTransaction } = useWallet();
  const { requireAuth } = useSecurity();

  const [recipient, setRecipient] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [txid, setTxid] = useState('');

  useEffect(() => {
    if (open) {
      setRecipient('');
      setAmountInput('');
      setError('');
      setTxid('');
      setIsSending(false);
    }
  }, [open]);

  if (!asset) return null;

  const isOwner = asset.name.endsWith('!');
  const heldFormatted = formatAssetAmount(asset.confirmedSats, asset.divisions);

  const handleSend = async () => {
    setError('');
    if (!isLegacyAddress(recipient)) {
      setError('Enter a valid legacy (R…) address. Assets can’t be sent to a bech32 (avn1…) address.');
      return;
    }
    let amount: bigint;
    try {
      amount = parseAssetAmount(amountInput, asset.divisions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid amount');
      return;
    }
    if (amount > BigInt(asset.confirmedSats)) {
      setError(`Amount exceeds your balance of ${heldFormatted} ${asset.name}`);
      return;
    }
    if (!electrum || !isConnected) {
      setError('Not connected to the Avian network. Please check your connection.');
      return;
    }

    setIsSending(true);
    try {
      const auth = await requireAuth(`Authenticate to send ${asset.name}`);
      if (!auth.success) {
        setError('Authentication is required to send an asset.');
        return;
      }
      const service = new WalletService(electrum);
      const id = await service.sendAssetTransfer(asset.name, amount, recipient.trim(), auth.password);
      setTxid(id);
      toast.success(`Sent ${asset.name}`);
      void refreshAfterTransaction(1500);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send the asset.');
    } finally {
      setIsSending(false);
    }
  };

  const body = txid ? (
    <div className="space-y-4">
      <Alert className="border-emerald-500/40 bg-emerald-500/10">
        <Check className="h-4 w-4 text-emerald-600" />
        <AlertDescription className="space-y-2">
          <p>
            Sent{' '}
            <span className="font-mono">
              {amountInput} {asset.name}
            </span>
            .
          </p>
          <a
            href={getExplorerUrl(txid)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-primary underline underline-offset-2"
          >
            View on explorer
          </a>
        </AlertDescription>
      </Alert>
      <Button className="w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Coins className="h-3.5 w-3.5 text-primary" /> Sending asset
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="truncate text-lg font-semibold">{asset.name}</span>
          <span className="flex-shrink-0 font-mono text-sm text-muted-foreground">
            Held: {heldFormatted}
          </span>
        </div>
      </div>

      {isOwner && (
        <Alert className="border-caution/40 bg-caution/10 [&>svg]:text-caution">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>{asset.name}</strong> is an owner token. Sending it hands over administrative
            control of <strong>{asset.name.slice(0, -1)}</strong> — reissue and management rights —
            to the recipient. This cannot be undone.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="asset-recipient">Recipient (R… address)</Label>
        <Input
          id="asset-recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="R…"
          spellCheck={false}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="asset-amount">Amount</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setAmountInput(heldFormatted)}
          >
            Max
          </Button>
        </div>
        <Input
          id="asset-amount"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder={asset.divisions === 0 ? '0' : `0.${'0'.repeat(asset.divisions)}`}
          inputMode="decimal"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {asset.divisions === 0
            ? 'This asset is not divisible — whole numbers only.'
            : `Up to ${asset.divisions} decimal place${asset.divisions === 1 ? '' : 's'}.`}{' '}
          The network fee is paid in AVN.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
        <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <span>Sending authenticates first — nothing moves until you authorise.</span>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => onOpenChange(false)}
          disabled={isSending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 gap-2"
          onClick={handleSend}
          disabled={isSending || !recipient || !amountInput}
        >
          <Lock className="h-4 w-4" />
          {isSending ? 'Sending…' : 'Send asset'}
        </Button>
      </div>
    </div>
  );

  const title = `Send ${asset.name}`;
  const description = 'Transfer this asset to another Avian address.';

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
