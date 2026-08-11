'use client';

import React, { useEffect, useState } from 'react';
import { Globe, ShieldCheck, Wallet } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConnectApprovalDecision } from '@/services/provider';

export interface ConnectAccountOption {
  name: string;
  address: string;
}

interface ConnectApprovalDialogProps {
  open: boolean;
  origin: string;
  accounts: ConnectAccountOption[];
  defaultAddress?: string;
  /**
   * True on the redirect transport, where the wallet navigates away after this one request, so a
   * grant that is not remembered cannot outlive it.
   */
  singleRequest?: boolean;
  onDecision: (decision: ConnectApprovalDecision) => void;
}

const shorten = (address: string) =>
  address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-8)}` : address;

export default function ConnectApprovalDialog({
  open,
  origin,
  accounts,
  defaultAddress,
  singleRequest = false,
  onDecision,
}: ConnectApprovalDialogProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [selected, setSelected] = useState<string>('');
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (!open) return;
    const fallback = defaultAddress || accounts[0]?.address || '';
    setSelected(fallback);
    setRemember(true);
  }, [open, defaultAddress, accounts]);

  const reject = () => onDecision({ approved: false, accounts: [], remember: false });

  const approve = () => {
    if (!selected) return;
    onDecision({ approved: true, accounts: [selected], remember });
  };

  const body = (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Requesting site
        </div>
        <p className="mt-1 break-all font-mono text-base font-semibold">{origin}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Account to share</Label>
        <ScrollArea className="max-h-56 rounded-md border">
          <div className="divide-y">
            {accounts.map((account) => {
              const isSelected = account.address === selected;
              return (
                <button
                  key={account.address}
                  type="button"
                  onClick={() => setSelected(account.address)}
                  className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                  }`}
                >
                  <Wallet
                    className={`h-4 w-4 flex-shrink-0 ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{account.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {shorten(account.address)}
                    </span>
                  </span>
                  {isSelected && <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="connect-remember" className="text-sm font-medium">
            Remember this site
          </Label>
          <p className="text-xs text-muted-foreground">
            {singleRequest
              ? 'Needed for the site to make any further request. Signing always asks.'
              : 'Skip this screen next time. Signing always asks.'}
          </p>
        </div>
        <Switch id="connect-remember" checked={remember} onCheckedChange={setRemember} />
      </div>

      <Alert className="border-primary/25 bg-primary/5 [&>svg]:text-primary">
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          The site will see your address only. Your private keys, mnemonic and balance history stay
          in this wallet.
        </AlertDescription>
      </Alert>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={reject}>
          Reject
        </Button>
        <Button className="flex-1" onClick={approve} disabled={!selected}>
          Connect
        </Button>
      </div>
    </div>
  );

  const title = 'Connection request';
  const description = 'A site is asking to see one of your Avian addresses.';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && reject()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && reject()}>
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
