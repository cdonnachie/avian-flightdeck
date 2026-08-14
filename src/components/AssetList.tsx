'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Coins, RefreshCw, Search, Send } from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { getHeldAssets, type HeldAsset } from '@/services/wallet/AssetService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SendAssetDialog from './SendAssetDialog';

/** The kind of Avian asset name, for a small type badge. */
function assetKind(name: string): 'owner' | 'unique' | 'sub' | 'restricted' | 'qualifier' | null {
  if (name.endsWith('!')) return 'owner'; // administrative token — grants reissue/management rights
  if (name.includes('#')) return name.startsWith('#') ? 'qualifier' : 'unique';
  if (name.startsWith('$')) return 'restricted';
  if (name.includes('/')) return 'sub';
  return null;
}

/**
 * Read-only list of Avian assets held by the active wallet, mirroring Core's Asset Balances panel.
 * Renders nothing until we know the wallet holds assets, so an AVN-only wallet sees no extra chrome.
 * Sending assets is a separate flow (see docs/proposals/avian-assets.md).
 */
export function AssetList({ className }: { className?: string }) {
  const { electrum, address, isConnected } = useWallet();
  const [assets, setAssets] = useState<HeldAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState<HeldAsset | null>(null);

  const load = useCallback(async () => {
    if (!electrum || !address) return;
    setLoading(true);
    try {
      setAssets(await getHeldAssets(electrum, address));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [electrum, address]);

  useEffect(() => {
    if (isConnected && address) void load();
  }, [isConnected, address, load]);

  // Stay invisible until we know there is something to show — no empty card for AVN-only wallets.
  if (!loaded && !loading) return null;
  if (loaded && assets.length === 0) return null;

  const filtered = query
    ? assets.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : assets;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 bg-card px-4 py-3 text-foreground [&_svg]:text-primary rounded-t-md">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Coins className="h-5 w-5 flex-shrink-0" />
          Assets
          {assets.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({assets.length})</span>
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh assets"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {assets.length > 6 && (
          <div className="relative border-b border-border/60 p-3">
            <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset name…"
              className="pl-9"
            />
          </div>
        )}

        {loading && assets.length === 0 ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((asset) => {
              const kind = assetKind(asset.name);
              return (
                <li
                  key={asset.name}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{asset.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {kind && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] capitalize">
                          {kind}
                        </Badge>
                      )}
                      {asset.meta?.reissuable && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          Reissuable
                        </Badge>
                      )}
                      {asset.unconfirmedSats !== 0 && (
                        <Badge className="h-4 bg-caution/15 px-1.5 text-[10px] text-caution hover:bg-caution/15">
                          Pending
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-mono text-sm">{asset.amount}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setSending(asset)}
                      disabled={asset.confirmedSats <= 0}
                      aria-label={`Send ${asset.name}`}
                      title={`Send ${asset.name}`}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No assets match “{query}”.
              </li>
            )}
          </ul>
        )}
      </CardContent>

      <SendAssetDialog
        open={sending !== null}
        onOpenChange={(next) => !next && setSending(null)}
        asset={sending}
        onSuccess={() => void load()}
      />
    </Card>
  );
}
