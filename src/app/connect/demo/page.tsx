'use client';

/**
 * A minimal dApp that speaks Avian Connect, for manual testing of both transports.
 *
 * It is deliberately written the way an external site would write it — it validates the source
 * and origin of every message it receives, and it keeps its own session state so a redirect
 * round trip does not lose the challenge it asked the user to sign.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Copy,
  ExternalLink,
  Radio,
  RefreshCw,
  Send,
  ShieldX,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  base64UrlEncode,
  isConnectResponse,
  readResponseFromFragment,
} from '@/services/provider/protocol';
import { WalletService } from '@/services/wallet/WalletService';
import { ConnectResponse } from '@/types/avianConnect';

const WALLET_PATH = '/connect';
const RETRY_INTERVAL_MS = 250;
const CALL_TIMEOUT_MS = 180_000;
/** The demo's own session, so a redirect navigation does not lose what it was doing. */
const SESSION_KEY = 'avian-connect-demo';

interface DemoSession {
  address?: string;
  publicKey?: string;
  message?: string;
  signature?: string;
}

interface LogEntry {
  at: string;
  direction: 'out' | 'in' | 'event' | 'note';
  text: string;
}

interface Verification {
  isValid: boolean;
  publicKey?: string;
  address: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const loadSession = (): DemoSession => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') as DemoSession;
  } catch {
    return {};
  }
};

const saveSession = (patch: DemoSession) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...loadSession(), ...patch }));
  } catch {
    // Session storage being unavailable only costs the demo its redirect continuity.
  }
};

const buildChallenge = () =>
  [
    `${window.location.host} wants you to sign in with your Avian address.`,
    '',
    `Nonce: ${newId().replace(/-/g, '').slice(0, 16)}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');

export default function ConnectDemoPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [address, setAddress] = useState<string>('');
  const [publicKey, setPublicKey] = useState<string>('');
  const [signature, setSignature] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [verification, setVerification] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const [walletService] = useState(() => new WalletService());
  const walletOrigin = typeof window === 'undefined' ? '' : window.location.origin;

  const append = useCallback((direction: LogEntry['direction'], text: string) => {
    setLog((entries) =>
      [{ at: new Date().toLocaleTimeString(), direction, text }, ...entries].slice(0, 60),
    );
  }, []);

  const applyResult = useCallback((response: ConnectResponse) => {
    if (response.error) {
      toast.error(response.error.code, { description: response.error.message });
      return;
    }
    const result = response.result as Record<string, unknown> | string[] | undefined;
    if (result && !Array.isArray(result)) {
      if (typeof result.address === 'string') {
        setAddress(result.address);
        saveSession({ address: result.address });
      }
      if (typeof result.publicKey === 'string') {
        setPublicKey(result.publicKey);
        saveSession({ publicKey: result.publicKey });
      }
      if (typeof result.signature === 'string') {
        setSignature(result.signature);
        saveSession({ signature: result.signature });
      }
    }
    toast.success('Wallet responded');
  }, []);

  // Restore the session first: the challenge that was signed must survive a redirect, or the
  // signature would be checked against a different message.
  useEffect(() => {
    const session = loadSession();
    if (session.address) setAddress(session.address);
    if (session.publicKey) setPublicKey(session.publicKey);
    if (session.signature) setSignature(session.signature);

    if (session.message) {
      setMessage(session.message);
    } else {
      const challenge = buildChallenge();
      setMessage(challenge);
      saveSession({ message: challenge });
    }
  }, []);

  // Redirect transport: the answer comes back in the fragment.
  useEffect(() => {
    const response = readResponseFromFragment(window.location.hash);
    if (!response) return;

    append('in', `redirect response ${JSON.stringify(response)}`);
    applyResult(response);
    // Scrub the fragment so the signature is not left sitting in the address bar.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [append, applyResult]);

  // Check the signature the way the dApp's own backend would: does it prove control of the
  // address it claims, over exactly the challenge we issued?
  useEffect(() => {
    if (!signature || !address || !message) {
      setVerification(null);
      return;
    }

    let cancelled = false;
    walletService
      .verifyMessage(address, message, signature, true)
      .then((result) => {
        if (cancelled) return;
        const isValid = typeof result === 'object' ? result.isValid : result;
        const recovered = typeof result === 'object' ? result.publicKey : undefined;
        setVerification({ isValid, publicKey: recovered, address });
        append('note', `verify ${isValid ? 'valid' : 'INVALID'}${recovered ? ` pubkey ${recovered}` : ''}`);
      })
      .catch(() => {
        if (!cancelled) setVerification({ isValid: false, address });
      });

    return () => {
      cancelled = true;
    };
  }, [signature, address, message, walletService, append]);

  const newChallenge = () => {
    const challenge = buildChallenge();
    setMessage(challenge);
    setSignature('');
    setVerification(null);
    saveSession({ message: challenge, signature: undefined });
  };

  const editMessage = (value: string) => {
    setMessage(value);
    saveSession({ message: value });
  };

  // ---------------------------------------------------------------------
  // Popup transport
  // ---------------------------------------------------------------------

  const call = useCallback(
    (method: string, params?: Record<string, unknown>) =>
      new Promise<ConnectResponse>((resolve, reject) => {
        if (!popupRef.current || popupRef.current.closed) {
          popupRef.current = window.open(WALLET_PATH, 'avian-connect', 'width=460,height=760');
          if (!popupRef.current) {
            reject(new Error('The wallet popup was blocked by the browser'));
            return;
          }
        }
        const popup = popupRef.current;
        const id = newId();
        const request = { avianConnect: 1, id, method, params };
        append('out', `${method} ${JSON.stringify(params ?? {})}`);

        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          clearInterval(retry);
          clearTimeout(timeout);
        };

        const onMessage = (event: MessageEvent) => {
          // A dApp must check both: the message must come from the popup it opened, and from
          // the wallet's own origin.
          if (event.source !== popup || event.origin !== walletOrigin) return;
          const data = event.data;
          if (!isConnectResponse(data)) {
            if (data && typeof data === 'object' && 'event' in data) {
              append('event', JSON.stringify(data));
            }
            return;
          }
          if (data.id !== id) return;
          cleanup();
          append('in', JSON.stringify(data));
          resolve(data);
        };

        window.addEventListener('message', onMessage);

        // No "wallet ready" broadcast exists, so retry until the wallet answers. The wallet
        // deduplicates by id, so retries never produce a second approval screen.
        const retry = setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error('The wallet window was closed'));
            return;
          }
          popup.postMessage(request, walletOrigin);
        }, RETRY_INTERVAL_MS);

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('The wallet did not respond in time'));
        }, CALL_TIMEOUT_MS);
      }),
    [append, walletOrigin],
  );

  const runPopup = async (method: string, params?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await call(method, params);
      applyResult(response);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Request failed';
      append('note', text);
      toast.error('Request failed', { description: text });
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------
  // Redirect transport
  // ---------------------------------------------------------------------

  const runRedirect = (method: string, params?: Record<string, unknown>) => {
    const request = {
      avianConnect: 1,
      id: newId(),
      method,
      params,
      origin: window.location.origin,
    };
    const redirectUri = window.location.origin + window.location.pathname;
    const url = `${WALLET_PATH}?req=${base64UrlEncode(JSON.stringify(request))}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    append('out', `redirect ${method} → ${url.slice(0, 90)}…`);
    window.location.assign(url);
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Copied', { description: `${label} copied to clipboard` });
  };

  const forget = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAddress('');
    setPublicKey('');
    setSignature('');
    setVerification(null);
    newChallenge();
    toast.success('Demo session cleared');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Avian Connect demo dApp
          </CardTitle>
          <CardDescription>
            A stand-in for a site like REALM, used to exercise both transports by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className="bg-muted/50">
            <AlertDescription className="text-xs">
              This page is served from <span className="font-mono">{walletOrigin}</span>, so the
              wallet will show that as the requesting origin. A real dApp lives on its own origin.
            </AlertDescription>
          </Alert>

          {/* data-testid hooks keep the end-to-end specs in e2e/ from depending on layout. */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Address</p>
              <p data-testid="demo-address" className="mt-1 break-all font-mono text-xs">
                {address || '—'}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Public key from connect()</p>
              <p data-testid="demo-public-key" className="mt-1 break-all font-mono text-xs">
                {publicKey || '—'}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Last signature</p>
              <p data-testid="demo-signature" className="mt-1 break-all font-mono text-xs">
                {signature ? `${signature.slice(0, 24)}…` : '—'}
              </p>
            </div>
          </div>

          {verification && (
            <Alert
              data-testid="demo-verification"
              data-valid={verification.isValid ? 'true' : 'false'}
              variant={verification.isValid ? 'default' : 'destructive'}
              className={verification.isValid ? 'border-primary/40 bg-primary/5' : undefined}
            >
              {verification.isValid ? (
                <BadgeCheck className="h-4 w-4" />
              ) : (
                <ShieldX className="h-4 w-4" />
              )}
              <AlertDescription className="space-y-2 text-xs">
                <p className="font-medium">
                  {verification.isValid
                    ? 'Signature verified — the signer controls this address.'
                    : 'Signature does not verify for this address and message.'}
                </p>
                <div>
                  <span className="text-muted-foreground">Signing address</span>
                  <p className="break-all font-mono">{verification.address}</p>
                </div>
                {verification.publicKey && (
                  <div>
                    <span className="text-muted-foreground">Extracted public key</span>
                    <p className="break-all font-mono">{verification.publicKey}</p>
                    {publicKey && (
                      <p className="mt-1 text-muted-foreground">
                        {publicKey === verification.publicKey
                          ? 'Matches the key connect() reported.'
                          : 'Does not match the key connect() reported.'}
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            {signature && (
              <>
                <Button size="sm" variant="outline" onClick={() => copy(signature, 'Signature')}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy signature
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(message, 'Message')}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy message
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/settings/advanced">
                    Check in Message Utilities
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={forget}>
              Clear demo session
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="demo-message">Login challenge to sign</Label>
              <Button size="sm" variant="ghost" onClick={newChallenge}>
                <RefreshCw className="mr-2 h-4 w-4" />
                New challenge
              </Button>
            </div>
            <Textarea
              id="demo-message"
              rows={5}
              value={message}
              onChange={(event) => editMessage(event.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Kept across a redirect, so the signature is always checked against the challenge that
              was actually signed.
            </p>
          </div>

          <Tabs defaultValue="popup" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="popup">Popup (desktop)</TabsTrigger>
              <TabsTrigger value="redirect">Redirect (mobile)</TabsTrigger>
            </TabsList>

            <TabsContent value="popup" className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button disabled={busy} onClick={() => runPopup('connect')}>
                  <Send className="mr-2 h-4 w-4" />
                  connect()
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => runPopup('getAccounts')}>
                  getAccounts()
                </Button>
                <Button
                  disabled={busy || !message}
                  onClick={() => runPopup('signMessage', { message })}
                >
                  signMessage()
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => runPopup('getNetwork')}>
                  getNetwork()
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => runPopup('disconnect')}>
                  disconnect()
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  // A valid but empty PSBT: the wallet shows the approval screen (nothing to sign
                  // here). A real dApp passes an unsigned PSBT it built for the connected account.
                  onClick={() => runPopup('signPsbt', { psbt: 'cHNidP8BAAoCAAAAAAAAAAAAAAAA' })}
                >
                  signPsbt()
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The wallet window stays open between calls so it can send events. Closing it ends
                the session and rejects anything still pending.
              </p>
            </TabsContent>

            <TabsContent value="redirect" className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => runRedirect('connect')}>
                  connect()
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  disabled={!message}
                  onClick={() => runRedirect('signMessage', { message })}
                >
                  signMessage()
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This navigates away to the wallet and comes back with the response in the URL
                fragment, which is then scrubbed from the address bar. Connect first, and leave
                &ldquo;remember this site&rdquo; on — a one-shot approval cannot survive the
                navigation, so signMessage() would come back ORIGIN_NOT_APPROVED.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Message log</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setLog([])}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64 rounded-md border">
            <div data-testid="demo-log" className="divide-y">
              {log.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">Nothing yet.</p>
              )}
              {log.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="flex gap-2 p-2 text-xs">
                  <span className="text-muted-foreground">{entry.at}</span>
                  <Badge
                    variant={entry.direction === 'in' ? 'default' : 'secondary'}
                    className="h-5 flex-shrink-0"
                  >
                    {entry.direction}
                  </Badge>
                  <span className="min-w-0 flex-1 break-all font-mono">{entry.text}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
