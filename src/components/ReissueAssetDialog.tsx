'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Flame, Lock } from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { WalletService } from '@/services/wallet/WalletService';
import { formatAssetAmount, parseAssetAmount, type HeldAsset } from '@/services/wallet/AssetService';
import { ISSUE_BURN } from '@/services/wallet/assetScript';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReissueAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: HeldAsset | null;
  onSuccess?: () => void;
}

const REISSUE_BURN = Number(ISSUE_BURN.reissue.amount) / 1e8; // 100 AVN

export default function ReissueAssetDialog({
  open,
  onOpenChange,
  asset,
  onSuccess,
}: ReissueAssetDialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { electrum, isConnected, refreshAfterTransaction } = useWallet();
  const { requireAuth } = useSecurity();

  const [amountInput, setAmountInput] = useState('0');
  const [unitsChoice, setUnitsChoice] = useState('keep'); // 'keep' | '<n>'
  const [reissuable, setReissuable] = useState(true);
  const [addIpfs, setAddIpfs] = useState(false);
  const [ipfs, setIpfs] = useState('');
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [txid, setTxid] = useState('');
  // Signed-but-unbroadcast hex from a dry run, for `avian-cli testmempoolaccept`.
  const [dryRunHex, setDryRunHex] = useState('');

  useEffect(() => {
    if (open) {
      setAmountInput('0');
      setUnitsChoice('keep');
      setReissuable(true);
      setAddIpfs(false);
      setIpfs('');
      setConfirmBurn(false);
      setError('');
      setTxid('');
      setDryRunHex('');
      setIsBusy(false);
    }
  }, [open]);

  if (!asset) return null;

  const currentDivisions = asset.divisions;
  // Reissue can only raise divisions.
  const higherDivisions = [1, 2, 3, 4, 5, 6, 7, 8].filter((u) => u > currentDivisions);

  const handleReissue = async (dryRun = false) => {
    setError('');
    setDryRunHex('');
    // A dry run broadcasts nothing and burns nothing, so it does not need the burn confirmation.
    if (!confirmBurn && !dryRun) {
      setError(`Please confirm the ${REISSUE_BURN} AVN burn.`);
      return;
    }
    if (!electrum || !isConnected) {
      setError('Not connected to the Avian network.');
      return;
    }

    // Additional supply; 0 (or blank) means a settings-only reissue.
    let amount = 0n;
    const trimmed = amountInput.trim();
    if (trimmed && !/^0(\.0*)?$/.test(trimmed)) {
      try {
        amount = parseAssetAmount(trimmed, currentDivisions);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid amount');
        return;
      }
    }

    const units = unitsChoice === 'keep' ? -1 : Number(unitsChoice);
    const ipfsValue = addIpfs && ipfs.trim() ? ipfs.trim() : undefined;

    if (amount === 0n && units === -1 && reissuable && !ipfsValue) {
      setError('Nothing to change — add supply, change divisions/reissuable, or set an IPFS hash.');
      return;
    }

    setIsBusy(true);
    try {
      const auth = await requireAuth(
        dryRun
          ? `Authenticate to build a ${asset.name} reissue (dry run)`
          : `Authenticate to reissue ${asset.name}`,
      );
      if (!auth.success) {
        setError('Authentication is required to reissue.');
        return;
      }
      const service = new WalletService(electrum);
      const id = await service.reissueAsset(
        asset.name,
        { amount, units, reissuable, ipfs: ipfsValue },
        auth.password,
        dryRun ? { buildOnly: true } : undefined,
      );

      if (dryRun) {
        setDryRunHex(id);
        try {
          await navigator.clipboard.writeText(id);
          toast.success('Raw hex copied — run testmempoolaccept in Core');
        } catch {
          toast.success('Transaction built — copy the hex below');
        }
        return;
      }

      setTxid(id);
      toast.success(`Reissued ${asset.name}`);
      void refreshAfterTransaction(1500);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reissue the asset.');
    } finally {
      setIsBusy(false);
    }
  };

  const body = txid ? (
    <div className="space-y-4">
      <Alert className="border-emerald-500/40 bg-emerald-500/10">
        <Check className="h-4 w-4 text-emerald-600" />
        <AlertDescription className="space-y-2">
          <p>
            Reissued <span className="font-mono">{asset.name}</span>.
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
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <span className="font-mono font-medium">{asset.name}</span>
        <span className="ml-2 text-muted-foreground">
          held {formatAssetAmount(asset.confirmedSats, currentDivisions)} · {currentDivisions} divisions
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reissue-amount">Mint additional supply</Label>
        <Input
          id="reissue-amount"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          inputMode="decimal"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">Leave 0 to only change the settings below.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Divisions</Label>
          <Select value={unitsChoice} onValueChange={setUnitsChoice} disabled={higherDivisions.length === 0}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Keep ({currentDivisions})</SelectItem>
              {higherDivisions.map((u) => (
                <SelectItem key={u} value={String(u)}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Can only increase.</p>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={reissuable} onCheckedChange={(c) => setReissuable(c === true)} />
            Stays reissuable
          </label>
        </div>
      </div>

      {!reissuable && (
        <Alert className="border-caution/40 bg-caution/10 [&>svg]:text-caution">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Unchecking this <strong>permanently locks</strong> {asset.name} — it can never be reissued
            again.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={addIpfs} onCheckedChange={(c) => setAddIpfs(c === true)} />
          Set / replace IPFS hash
        </label>
        {addIpfs && (
          <Input
            value={ipfs}
            onChange={(e) => setIpfs(e.target.value)}
            placeholder="IPFS v0 hash (Qm…) or a 64-character txid"
            className="font-mono text-xs"
            spellCheck={false}
          />
        )}
      </div>

      <Alert className="border-caution/40 bg-caution/10 [&>svg]:text-caution">
        <Flame className="h-4 w-4" />
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Reissuing <strong>permanently burns {REISSUE_BURN} AVN</strong> and cannot be undone.
          </p>
          <label className="flex items-center gap-2 font-medium">
            <Checkbox checked={confirmBurn} onCheckedChange={(c) => setConfirmBurn(c === true)} />I
            understand {REISSUE_BURN} AVN will be burned.
          </label>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dryRunHex && (
        <Alert className="border-primary/40 bg-primary/5">
          <AlertDescription className="space-y-2 text-sm">
            <p>
              Built and signed, <strong>not broadcast</strong>. Check it with:{' '}
              <code className="font-mono text-xs">avian-cli testmempoolaccept &apos;[&quot;&lt;hex&gt;&quot;]&apos;</code>
            </p>
            <textarea
              readOnly
              value={dryRunHex}
              onFocus={(e) => e.currentTarget.select()}
              className="h-24 w-full resize-none rounded-md border border-border bg-card p-2 font-mono text-[10px] break-all"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(dryRunHex);
                toast.success('Raw hex copied');
              }}
            >
              Copy hex
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isBusy}>
          Cancel
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void handleReissue(true)}
          disabled={isBusy}
          title="Build and sign without broadcasting, for testmempoolaccept"
        >
          {isBusy ? 'Building…' : 'Dry run'}
        </Button>
        <Button className="flex-1 gap-2" onClick={() => void handleReissue()} disabled={isBusy || !confirmBurn}>
          <Lock className="h-4 w-4" />
          {isBusy ? 'Reissuing…' : `Reissue (burn ${REISSUE_BURN} AVN)`}
        </Button>
      </div>
    </div>
  );

  const title = `Reissue ${asset.name}`;
  const description = 'Mint more supply or update this asset. Burns AVN and is permanent.';

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
