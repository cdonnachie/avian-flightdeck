'use client';

import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  FileUp,
  Info,
  Lock,
  Radio,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { useWallet } from '@/contexts/WalletContext';
import { WalletService } from '@/services/wallet/WalletService';
import type { PsbtSummary } from '@/services/wallet/psbt';
import { getExplorerUrl } from '@/lib/explorer';
import AuthenticationDialog from './AuthenticationDialog';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

const avn = (sats: number) => (sats / 1e8).toFixed(8);
const shorten = (a: string) => (a.length > 24 ? `${a.slice(0, 12)}…${a.slice(-10)}` : a);

/**
 * Import a partially-signed transaction (PSBT) — from Avian Core, a co-signer, or a watch-only
 * setup — review exactly what it moves, sign the inputs this wallet owns, then broadcast it or hand
 * the signed PSBT back. Asset inputs are surfaced and never signed. See src/services/wallet/psbt.ts.
 */
export default function PsbtSigner() {
  const { address, isEncrypted, refreshAfterTransaction, electrum, isConnected } = useWallet();
  const [walletService] = useState(() => new WalletService());
  const fileRef = useRef<HTMLInputElement>(null);

  const [psbtText, setPsbtText] = useState('');
  const [summary, setSummary] = useState<PsbtSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [signedPsbt, setSignedPsbt] = useState('');
  const [signedInputs, setSignedInputs] = useState(0);
  const [complete, setComplete] = useState(false);
  const [txid, setTxid] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [copied, setCopied] = useState<'psbt' | 'txid' | null>(null);

  const reset = () => {
    setSummary(null);
    setSummaryError('');
    setSignedPsbt('');
    setSignedInputs(0);
    setComplete(false);
    setTxid('');
  };

  const onTextChange = (value: string) => {
    setPsbtText(value);
    if (summary || summaryError || signedPsbt || txid) reset();
  };

  const copy = async (text: string, which: 'psbt' | 'txid') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleReview = async () => {
    const text = psbtText.trim();
    if (!text) return;
    reset();
    setIsBusy(true);
    try {
      const result = await walletService.summarizePsbt(text, address || undefined);
      setSummary(result);
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : 'This does not look like a valid base64 PSBT.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    const raw = (await file.text()).trim();
    // A .psbt file may be binary; if it starts with the magic bytes, base64-encode it first.
    let text = raw;
    if (raw.startsWith('psbt\xff') || raw.charCodeAt(0) === 0x70) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes[0] === 0x70 && bytes[1] === 0x73 && bytes[2] === 0x62 && bytes[3] === 0x74) {
          text = btoa(String.fromCharCode(...bytes));
        }
      } catch {
        /* fall back to the raw text */
      }
    }
    setPsbtText(text);
    reset();
  };

  const startSign = () => {
    if (isEncrypted) {
      setShowAuth(true);
    } else {
      void doSign();
    }
  };

  const doSign = async (password?: string) => {
    setShowAuth(false);
    setIsBusy(true);
    try {
      const result = await walletService.signPsbt(psbtText.trim(), password);
      setSignedPsbt(result.psbt);
      setSignedInputs(result.signedInputs);
      setComplete(result.complete);
      // Re-summarise the signed PSBT so the panel reflects the new signatures.
      setSummary(await walletService.summarizePsbt(result.psbt, address || undefined));
      if (result.signedInputs > 0) {
        toast.success(`Signed ${result.signedInputs} input${result.signedInputs === 1 ? '' : 's'}`);
      } else {
        toast.info('No inputs on this PSBT could be signed by this wallet');
      }
    } catch (error) {
      toast.error('Signing failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleBroadcast = async () => {
    // The component's WalletService is offline (summarize/sign/finalize need no network); broadcast
    // must go through the wallet's live, connected ElectrumService from context.
    if (!electrum || !isConnected) {
      toast.error('Not connected', {
        description: 'Connect to the Avian network before broadcasting.',
      });
      return;
    }
    setIsBusy(true);
    try {
      const { hex, txid: id } = walletService.finalizePsbt(signedPsbt);
      const broadcastId = await electrum.broadcastTransaction(hex);
      if (!broadcastId || typeof broadcastId !== 'string') {
        throw new Error('Transaction broadcast failed. Please try again later.');
      }
      setTxid(broadcastId || id);
      toast.success('Transaction broadcast');
      void refreshAfterTransaction(1500);
    } catch (error) {
      toast.error('Broadcast failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const canSign = !!summary && summary.signableByUs > 0 && !signedPsbt;
  const activePsbt = signedPsbt || psbtText;

  return (
    <Card className="w-full mt-2">
      <CardContent className="space-y-4 py-6">
        <div className="space-y-2">
          <Label htmlFor="psbt-input">Partially-signed transaction (PSBT)</Label>
          <Textarea
            id="psbt-input"
            value={psbtText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste a base64 PSBT (starts with cHNidP…) exported from Avian Core or a co-signer"
            rows={5}
            spellCheck={false}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="gap-2"
            >
              <FileUp className="h-4 w-4" /> Upload .psbt
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".psbt,.txt,text/plain,application/octet-stream"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleReview}
              disabled={isBusy || !psbtText.trim()}
              className="gap-2"
            >
              <Search className="h-4 w-4" /> Review
            </Button>
          </div>
        </div>

        {summaryError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        )}

        {summary && (
          <div className="space-y-4">
            {summary.hasAsset && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription>
                  This transaction touches an Avian asset. Asset inputs are never signed here — doing
                  so as a plain transfer would burn the asset.
                </AlertDescription>
              </Alert>
            )}

            <section className="rounded-lg border border-border">
              <SectionHeader icon={<ArrowDownToLine className="h-3.5 w-3.5" />} label="Inputs" />
              {summary.inputs.map((input, i) => (
                <PartyRow
                  key={`${input.txid}:${input.vout}`}
                  address={input.address}
                  valueSats={input.value}
                  isMine={input.isMine}
                  isAsset={input.isAsset}
                  badge={input.signed ? 'Signed' : undefined}
                  fallback={`Input ${i + 1}`}
                />
              ))}
            </section>

            <section className="rounded-lg border border-border">
              <SectionHeader icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} label="Outputs" />
              {summary.outputs.map((output, i) => (
                <PartyRow
                  key={i}
                  address={output.address}
                  valueSats={output.value}
                  isMine={output.isMine}
                  isAsset={output.isAsset}
                  fallback="Non-standard output"
                />
              ))}
            </section>

            <div className="rounded-lg border border-border">
              <Row k="Total in" v={summary.totalIn === null ? 'Unknown' : `${avn(summary.totalIn)} AVN`} />
              <Row k="Total out" v={`${avn(summary.totalOut)} AVN`} />
              <Row
                k="Network fee"
                v={summary.fee === null ? 'Unknown' : `${avn(summary.fee)} AVN`}
                strong
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {complete || summary.complete ? (
                <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                  <Check className="h-3 w-3" /> Fully signed
                </Badge>
              ) : summary.signableByUs > 0 ? (
                <span>
                  You can sign{' '}
                  <span className="font-medium text-foreground">{summary.signableByUs}</span> input
                  {summary.signableByUs === 1 ? '' : 's'}.
                </span>
              ) : (
                <span>No inputs on this PSBT belong to this wallet.</span>
              )}
            </div>
          </div>
        )}

        {summary && !signedPsbt && (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span>
              Signing opens authentication. Nothing is signed or broadcast until you authorise, and
              only inputs this wallet owns are touched.
            </span>
          </div>
        )}

        {canSign && (
          <Button onClick={startSign} disabled={isBusy} className="w-full gap-2">
            <Lock className="h-4 w-4" />
            {isBusy ? 'Signing…' : `Sign ${summary!.signableByUs} input${summary!.signableByUs === 1 ? '' : 's'}`}
          </Button>
        )}

        {signedPsbt && !txid && (
          <div className="space-y-3">
            <Alert className="border-emerald-500/40 bg-emerald-500/10">
              <Check className="h-4 w-4 text-emerald-600" />
              <AlertDescription>
                Signed {signedInputs} input{signedInputs === 1 ? '' : 's'}.{' '}
                {complete
                  ? 'The transaction is complete and ready to broadcast.'
                  : 'More signatures are needed — share the signed PSBT with the other signer.'}
              </AlertDescription>
            </Alert>

            {complete && (
              <Button onClick={handleBroadcast} disabled={isBusy} className="w-full gap-2">
                <Radio className="h-4 w-4" />
                {isBusy ? 'Broadcasting…' : 'Broadcast transaction'}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => copy(signedPsbt, 'psbt')}
              className="w-full gap-2"
            >
              {copied === 'psbt' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy signed PSBT
            </Button>
          </div>
        )}

        {txid && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10">
            <Check className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="space-y-2">
              <p>Broadcast successfully.</p>
              <div className="flex items-center gap-2">
                <code className="break-all font-mono text-xs">{txid}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => copy(txid, 'txid')}
                >
                  {copied === 'txid' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
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
        )}

        {activePsbt && !summary && !summaryError && (
          <p className="text-xs text-muted-foreground">Press Review to decode this PSBT.</p>
        )}
      </CardContent>

      <CardFooter className="border-t p-4">
        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            PSBTs let an offline or watch-only wallet build a transaction that this wallet signs.
            Avian uses standard BIP174 with the network&apos;s FORKID sighash, so PSBTs from Avian
            Core round-trip here. Nothing leaves your device until you broadcast.
          </AlertDescription>
        </Alert>
      </CardFooter>

      <AuthenticationDialog
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onAuthenticate={(password) => void doSign(password)}
        title="Authenticate to sign PSBT"
        message="Enter your wallet password to sign the inputs you own."
        walletAddress={address}
      />
    </Card>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function PartyRow({
  address,
  valueSats,
  isMine,
  isAsset,
  badge,
  fallback,
}: {
  address: string | null;
  valueSats: number | null;
  isMine: boolean;
  isAsset: boolean;
  badge?: string;
  fallback: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-sm first:border-t-0">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs">{address ? shorten(address) : fallback}</span>
        <span className="mt-0.5 flex flex-wrap gap-1">
          {isMine && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              Yours
            </Badge>
          )}
          {isAsset && (
            <Badge className="h-4 bg-amber-500/15 px-1.5 text-[10px] text-amber-600 hover:bg-amber-500/15">
              Asset
            </Badge>
          )}
          {badge && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {badge}
            </Badge>
          )}
        </span>
      </span>
      <span className="flex-shrink-0 font-mono">{valueSats === null ? '—' : `${avn(valueSats)} AVN`}</span>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-sm first:border-t-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={strong ? 'font-mono font-semibold' : 'font-mono'}>{v}</span>
    </div>
  );
}
