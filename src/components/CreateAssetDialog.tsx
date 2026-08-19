'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Flame, Lock } from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { WalletService } from '@/services/wallet/WalletService';
import { parseAssetAmount } from '@/services/wallet/AssetService';
import { ISSUE_BURN, isValidRootAssetName } from '@/services/wallet/assetScript';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AssetType = 'root' | 'sub' | 'unique';

interface CreateAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Root names the wallet can create children under (from held `NAME!` owner tokens). */
  ownedRoots: string[];
  onSuccess?: () => void;
}

const burnFor = (type: AssetType) =>
  Number(type === 'root' ? ISSUE_BURN.root.amount : type === 'sub' ? ISSUE_BURN.sub.amount : ISSUE_BURN.unique.amount) /
  1e8;

export default function CreateAssetDialog({
  open,
  onOpenChange,
  ownedRoots,
  onSuccess,
}: CreateAssetDialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { electrum, isConnected, refreshAfterTransaction } = useWallet();
  const { requireAuth } = useSecurity();

  const [type, setType] = useState<AssetType>('root');
  const [rootName, setRootName] = useState('');
  const [parent, setParent] = useState('');
  const [childPart, setChildPart] = useState('');
  const [amountInput, setAmountInput] = useState('1');
  const [units, setUnits] = useState('0');
  const [reissuable, setReissuable] = useState(true);
  const [addIpfs, setAddIpfs] = useState(false);
  const [ipfs, setIpfs] = useState('');
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [txid, setTxid] = useState('');
  // Signed-but-unbroadcast hex from a dry run, for `avian-cli testmempoolaccept`.
  const [dryRunHex, setDryRunHex] = useState('');

  // Reset only when the dialog opens — NOT when ownedRoots changes. After a successful issuance the
  // asset list refreshes and ownedRoots gains the new owner token; if that re-ran this effect it
  // would wipe txid and drop the success screen (with its explorer link) back to the empty form.
  useEffect(() => {
    if (open) {
      setType('root');
      setRootName('');
      setParent(ownedRoots[0] ?? '');
      setChildPart('');
      setAmountInput('1');
      setUnits('0');
      setReissuable(true);
      setAddIpfs(false);
      setIpfs('');
      setConfirmBurn(false);
      setError('');
      setTxid('');
      setDryRunHex('');
      setIsBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fullName = useMemo(() => {
    if (type === 'root') return rootName.trim();
    if (type === 'sub') return parent && childPart ? `${parent}/${childPart.trim()}` : '';
    return parent && childPart ? `${parent}#${childPart.trim()}` : '';
  }, [type, rootName, parent, childPart]);

  const burn = burnFor(type);
  const needsParent = type === 'sub' || type === 'unique';
  const divisions = Number(units) || 0;

  const handleCreate = async (dryRun = false) => {
    setError('');
    setDryRunHex('');
    if (needsParent && !parent) {
      setError('Choose a parent asset — you need its owner token to create this.');
      return;
    }
    if (type === 'root' && !isValidRootAssetName(fullName)) {
      setError('Invalid name. 3–30 characters of A–Z, 0–9, _ and . (no leading/trailing/doubled punctuation).');
      return;
    }
    if (needsParent && !childPart.trim()) {
      setError(type === 'sub' ? 'Enter a sub-asset name.' : 'Enter a unique tag.');
      return;
    }
    // A dry run broadcasts nothing and burns nothing, so it does not need the burn confirmation.
    if (!confirmBurn && !dryRun) {
      setError(`Please confirm the ${burn} AVN burn.`);
      return;
    }
    if (!electrum || !isConnected) {
      setError('Not connected to the Avian network.');
      return;
    }

    let amount: bigint;
    try {
      amount = type === 'unique' ? 100_000_000n : parseAssetAmount(amountInput, divisions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid amount');
      return;
    }

    setIsBusy(true);
    try {
      // Friendly pre-flight: refuse a name that already exists (consensus enforces this too).
      try {
        const meta = await electrum.getAssetMeta(fullName);
        if (meta) {
          setError(`"${fullName}" already exists.`);
          setIsBusy(false);
          return;
        }
      } catch {
        /* get_meta throws for a non-existent asset — that's the good case. */
      }

      const auth = await requireAuth(
        dryRun ? `Authenticate to build ${fullName} (dry run)` : `Authenticate to create ${fullName}`,
      );
      if (!auth.success) {
        setError('Authentication is required to create an asset.');
        return;
      }

      const ipfsValue = addIpfs && ipfs.trim() ? ipfs.trim() : undefined;
      const service = new WalletService(electrum);
      // With buildOnly the builders return signed raw hex instead of broadcasting.
      const options = dryRun ? { buildOnly: true } : undefined;
      let id: string;
      if (type === 'root') {
        id = await service.issueAsset(
          fullName,
          { amount, units: divisions, reissuable, ipfs: ipfsValue },
          auth.password,
          options,
        );
      } else if (type === 'sub') {
        id = await service.issueSubAsset(
          fullName,
          { amount, units: divisions, reissuable, ipfs: ipfsValue },
          auth.password,
          options,
        );
      } else {
        id = await service.issueUniqueAsset(fullName, ipfsValue, auth.password, options);
      }

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
      toast.success(`Created ${fullName}`);
      void refreshAfterTransaction(1500);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the asset.');
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
            Created <span className="font-mono">{fullName}</span> — and its{' '}
            <span className="font-mono">{fullName}!</span> owner token.
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
      <Tabs
        value={type}
        onValueChange={(v) => {
          setType(v as AssetType);
          // The burn amount differs per type — never carry a confirmation across a change.
          setConfirmBurn(false);
          setError('');
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="root">Root</TabsTrigger>
          <TabsTrigger value="sub" disabled={ownedRoots.length === 0}>
            Sub
          </TabsTrigger>
          <TabsTrigger value="unique" disabled={ownedRoots.length === 0}>
            Unique
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {needsParent && ownedRoots.length === 0 && (
        <Alert>
          <AlertDescription className="text-sm">
            You need to own an asset (its <span className="font-mono">NAME!</span> owner token) before
            creating a sub-asset or unique under it.
          </AlertDescription>
        </Alert>
      )}

      {type === 'root' ? (
        <div className="space-y-2">
          <Label htmlFor="root-name">Asset name</Label>
          <Input
            id="root-name"
            value={rootName}
            onChange={(e) => setRootName(e.target.value.toUpperCase())}
            placeholder="MYASSET"
            className="font-mono"
            autoCapitalize="characters"
          />
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-2">
            <Label>Parent</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger className="font-mono">
                <SelectValue placeholder="Owned asset" />
              </SelectTrigger>
              <SelectContent>
                {ownedRoots.map((r) => (
                  <SelectItem key={r} value={r} className="font-mono">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="pb-2.5 font-mono text-lg text-muted-foreground">
            {type === 'sub' ? '/' : '#'}
          </span>
          <div className="space-y-2">
            <Label htmlFor="child-part">{type === 'sub' ? 'Sub-asset' : 'Tag'}</Label>
            <Input
              id="child-part"
              value={childPart}
              onChange={(e) => setChildPart(type === 'sub' ? e.target.value.toUpperCase() : e.target.value)}
              placeholder={type === 'sub' ? 'SUB' : '001'}
              className="font-mono"
            />
          </div>
        </div>
      )}

      {fullName && (
        <p className="text-xs text-muted-foreground">
          Creating <span className="font-mono text-foreground">{fullName}</span>
        </p>
      )}

      {type !== 'unique' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="supply">Supply</Label>
            <Input
              id="supply"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              inputMode="decimal"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="divisions">Divisions</Label>
            <Select value={units} onValueChange={setUnits}>
              <SelectTrigger id="divisions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((u) => (
                  <SelectItem key={u} value={String(u)}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {type !== 'unique' ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={reissuable} onCheckedChange={(c) => setReissuable(c === true)} />
          Reissuable (you can mint more or change it later)
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">
          Unique assets are always quantity 1, indivisible, and cannot be reissued.
        </p>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={addIpfs} onCheckedChange={(c) => setAddIpfs(c === true)} />
          Add IPFS / TXid hash
        </label>
        {addIpfs && (
          <>
            <Input
              value={ipfs}
              onChange={(e) => setIpfs(e.target.value)}
              placeholder="IPFS v0 hash (Qm…) or a 64-character txid"
              className="font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Avian accepts IPFS <strong>v0</strong> CIDs only (SHA-256, base58 — starts with{' '}
              <span className="font-mono">Qm</span>).
            </p>
          </>
        )}
      </div>

      <Alert className="border-caution/40 bg-caution/10 [&>svg]:text-caution">
        <Flame className="h-4 w-4" />
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Creating this <strong>permanently burns {burn} AVN</strong> and cannot be undone.
          </p>
          <label className="flex items-center gap-2 font-medium">
            <Checkbox checked={confirmBurn} onCheckedChange={(c) => setConfirmBurn(c === true)} />I
            understand {burn} AVN will be burned.
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
          onClick={() => void handleCreate(true)}
          disabled={isBusy || !fullName}
          title="Build and sign without broadcasting, for testmempoolaccept"
        >
          {isBusy ? 'Building…' : 'Dry run'}
        </Button>
        <Button className="flex-1 gap-2" onClick={() => void handleCreate()} disabled={isBusy || !fullName || !confirmBurn}>
          <Lock className="h-4 w-4" />
          {isBusy ? 'Creating…' : `Create (burn ${burn} AVN)`}
        </Button>
      </div>
    </div>
  );

  const title = 'Create asset';
  const description = 'Issue a new Avian asset. This burns AVN and is permanent.';

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
