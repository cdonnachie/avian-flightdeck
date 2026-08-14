'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Plus, PlusCircle, RefreshCw, Search, Send } from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { getHeldAssets, ipfsImageUrl, type HeldAsset } from '@/services/wallet/AssetService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SendAssetDialog from './SendAssetDialog';
import CreateAssetDialog from './CreateAssetDialog';
import ReissueAssetDialog from './ReissueAssetDialog';

/** A small asset avatar: the IPFS image when the asset has one (click to enlarge), else a coin glyph. */
function AssetThumbnail({ asset, onPreview }: { asset: HeldAsset; onPreview: (url: string) => void }) {
  const [failed, setFailed] = useState(false);
  const url = asset.meta?.hasIpfs ? ipfsImageUrl(asset.meta.ipfs) : null;

  if (!url || failed) {
    return (
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
        <Coins className="h-4 w-4" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPreview(url)}
      className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md"
      aria-label={`View ${asset.name} image`}
    >
      {/* Plain <img> (not next/image) — external IPFS content, lazily loaded, hidden gracefully if
          the hash isn't an image or the gateway fails. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </button>
  );
}

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
  const [reissuing, setReissuing] = useState<HeldAsset | null>(null);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

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

  // Reload now and again shortly after — a just-spent/created asset only drops off (or appears)
  // once ElectrumX reflects the new tx, which lags the broadcast by a moment.
  const reloadSoon = useCallback(() => {
    void load();
    setTimeout(() => void load(), 2500);
  }, [load]);

  useEffect(() => {
    if (isConnected && address) void load();
  }, [isConnected, address, load]);

  // Assets are legacy-address-only; a legacy wallet can create even with nothing held yet.
  const canCreate = !!address && address.startsWith('R');
  // Owner tokens we hold (NAME!) → the roots we can create sub/unique assets under.
  const ownedRoots = assets
    .filter((a) => a.name.endsWith('!'))
    .map((a) => a.name.slice(0, -1));

  // Stay invisible until loaded; then only hide when there's nothing to show and nothing to create.
  if (!loaded && !loading) return null;
  if (loaded && assets.length === 0 && !canCreate) return null;

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
        <span className="flex items-center gap-1">
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" /> Create
            </Button>
          )}
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
        </span>
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
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <AssetThumbnail
                    asset={asset}
                    onPreview={(url) => setPreview({ url, name: asset.name })}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
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
                  <span className="flex flex-shrink-0 items-center gap-1">
                    <span className="mr-1 font-mono text-sm">{asset.amount}</span>
                    {asset.meta?.reissuable && ownedRoots.includes(asset.name) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setReissuing(asset)}
                        aria-label={`Reissue ${asset.name}`}
                        title={`Reissue ${asset.name}`}
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    )}
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
                {query ? `No assets match “${query}”.` : 'No assets yet — create one to get started.'}
              </li>
            )}
          </ul>
        )}
      </CardContent>

      <SendAssetDialog
        open={sending !== null}
        onOpenChange={(next) => !next && setSending(null)}
        asset={sending}
        onSuccess={reloadSoon}
      />

      <ReissueAssetDialog
        open={reissuing !== null}
        onOpenChange={(next) => !next && setReissuing(null)}
        asset={reissuing}
        onSuccess={reloadSoon}
      />

      <CreateAssetDialog
        open={creating}
        onOpenChange={setCreating}
        ownedRoots={ownedRoots}
        onSuccess={reloadSoon}
      />

      <Dialog open={preview !== null} onOpenChange={(next) => !next && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-all font-mono text-sm">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="mx-auto max-h-[70vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
