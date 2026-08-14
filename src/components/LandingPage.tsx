'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * New-visitor landing page shown at `/` only when there is no wallet on the device. A committed
 * single-theme "instrument panel" marketing page keyed to the Avian brand — it paints its own
 * night ground and does not follow the viewer's OS theme, by design. Uses the app's already-loaded
 * Inter / Roboto Mono (via the CSS variables layout.tsx sets) and the real logo asset.
 */
export default function LandingPage() {
  const router = useRouter();
  const balRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = balRef.current;
    if (!el) return;
    const TARGET = 1240.5064;
    const fmt = (n: number) =>
      n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = fmt(TARGET);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / 1200, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(TARGET * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else el.textContent = fmt(TARGET);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = () => router.push('/onboarding');

  return (
    <div className="fdl">
      <style>{CSS}</style>

      <div className="fdl-topbar">
        <div className="fdl-wrap fdl-topbar__row">
          <div className="fdl-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fdl-brand__mark" src="/logomark-white.svg" alt="Avian" width={30} height={30} />
            <span className="fdl-brand__name">
              AVIAN <b>FLIGHTDECK</b>
            </span>
          </div>
          <button className="fdl-btn fdl-btn--go" onClick={start}>
            Get started <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      <header className="fdl-hero">
        <div className="fdl-wrap fdl-hero__grid">
          <div>
            <div className="fdl-eyebrow">
              <span className="fdl-tag">TICKER <b>AVN</b></span>
              <span className="fdl-tag">SELF-CUSTODY</span>
              <span className="fdl-tag">PWA</span>
            </div>
            <h1 className="fdl-display">
              Your funds,
              <br />
              <span className="fdl-grad">on instruments.</span>
            </h1>
            <p className="fdl-lede">
              A self-custody Avian wallet. Keys are generated, encrypted, and used{' '}
              <b>entirely on your device</b> — nothing is ever sent to a server, and no one else can
              move your coins. Read your whole position at a glance, the way a pilot reads a panel.
            </p>
            <div className="fdl-cta">
              <button className="fdl-btn fdl-btn--go" onClick={start}>
                Create a wallet <span aria-hidden>→</span>
              </button>
              <button className="fdl-btn fdl-btn--ghost" onClick={start}>
                Import existing
              </button>
            </div>
          </div>

          <div
            className="fdl-pfd"
            role="img"
            aria-label="A primary-flight-display instrument panel: a level artificial horizon, a network-online lamp, a keys-local lamp, and a total balance readout."
          >
            <div className="fdl-pfd__screen">
              <div className="fdl-horizon">
                <div className="fdl-horizon__sky" />
                <div className="fdl-horizon__ground" />
                <div className="fdl-horizon__line" />
                {/* pitch-ladder reference marks — drift with the horizon */}
                <div className="fdl-ladder" aria-hidden>
                  <span style={{ top: -56, width: 34 }} />
                  <span style={{ top: -28, width: 22 }} />
                  <span style={{ top: 28, width: 22 }} />
                  <span style={{ top: 56, width: 34 }} />
                </div>
              </div>
              <svg className="fdl-aircraft" width="150" height="30" viewBox="0 0 150 30" aria-hidden>
                <path d="M18 15 L58 15 M92 15 L132 15" stroke="#34F5C6" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M58 15 L64 22 M92 15 L86 22" stroke="#34F5C6" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="75" cy="15" r="3.4" fill="#04121a" stroke="#34F5C6" strokeWidth="2.2" />
              </svg>
              {/* roll / bank scale — a fixed reference at the top of the display */}
              <svg className="fdl-roll" width="132" height="34" viewBox="0 0 132 34" aria-hidden>
                <path d="M12 30 A56 56 0 0 1 120 30" fill="none" stroke="rgba(230,240,242,0.4)" strokeWidth="1.4" />
                <path d="M66 6 L61 15 L71 15 Z" fill="#34F5C6" />
                <path d="M28 20 L26 25 M104 20 L106 25 M66 12 L66 17" stroke="rgba(230,240,242,0.5)" strokeWidth="1.2" />
              </svg>
              <div className="fdl-ann fdl-ann--l"><span className="fdl-lamp" /> Network · Online</div>
              <div className="fdl-ann fdl-ann--r">Keys · Local <span className="fdl-lamp" /></div>
              <div className="fdl-pfd__band">
                <div className="fdl-label" style={{ marginBottom: 8 }}>Total · Mainnet</div>
                <div className="fdl-readout tnum">
                  <span ref={balRef}>0.0000</span>
                  <small>AVN</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="fdl-annun" aria-label="Custody guarantees">
        <div className="fdl-wrap fdl-annun__row">
          <div className="fdl-annun__cell"><span className="fdl-lamp" /><span className="fdl-t">Keys never leave<small>generated &amp; stored on device</small></span></div>
          <div className="fdl-annun__cell"><span className="fdl-lamp" /><span className="fdl-t">No custodian<small>you hold the only key</small></span></div>
          <div className="fdl-annun__cell"><span className="fdl-lamp fdl-lamp--indigo" /><span className="fdl-t">Self-hostable<small>runs as static files</small></span></div>
          <div className="fdl-annun__cell"><span className="fdl-lamp fdl-lamp--turq" /><span className="fdl-t">Installable PWA<small>works offline, adds to home</small></span></div>
        </div>
      </section>

      <section className="fdl-section">
        <div className="fdl-wrap">
          <div className="fdl-head">
            <span className="fdl-label">Instrument cluster</span>
            <h2>Every control you&apos;d expect on the panel</h2>
            <p>The things a serious holder actually reaches for — coin-level control, dApp sign-in, cold-storage monitoring — each on its own gauge.</p>
          </div>
          <div className="fdl-cluster">
            {FEATURES.map((f) => (
              <article className="fdl-gauge" key={f.tag}>
                <span className="fdl-gauge__tag">{f.tag}</span>
                <div className="fdl-gauge__face" style={{ color: f.color }}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fdl-section fdl-preflight" id="preflight">
        <div className="fdl-wrap">
          <div className="fdl-head">
            <span className="fdl-label">Preflight checklist</span>
            <h2>What you&apos;re agreeing to before takeoff</h2>
            <p>Self-custody is a real handover of responsibility. Three items are guarantees the wallet gives you; the last is the one you give yourself.</p>
          </div>
          <div className="fdl-checklist">
            {CHECKS.map((c) => (
              <div className="fdl-check" key={c.title}>
                <span className={`fdl-check__box${c.warn ? ' warn' : ''}`} aria-hidden>
                  {c.warn ? (
                    <svg width="13" height="13" viewBox="0 0 14 14"><path d="M7 1.5 L13 12 H1 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M7 6 v3 M7 10.4 v0.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 7 l3.5 3.5 L12 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </span>
                <div><div className="fdl-check__title">{c.title}</div><div className="fdl-check__desc">{c.body}</div></div>
                <div className={`fdl-check__state${c.warn ? ' warn' : ''}`}>{c.warn ? 'Your call' : 'Verified'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="fdl-section" aria-label="Under the panel">
        <div className="fdl-wrap">
          <div className="fdl-head"><span className="fdl-label">Under the panel</span><h2>The avionics, spelled out</h2></div>
          <div className="fdl-specs">
            <div className="fdl-spec"><div className="k">Encryption at rest</div><div className="v">Argon2id + AES-256-GCM</div></div>
            <div className="fdl-spec"><div className="k">Key derivation</div><div className="v">BIP39 · BIP32 HD</div></div>
            <div className="fdl-spec"><div className="k">Signatures</div><div className="v">SIGHASH · FORKID (0x41)</div></div>
            <div className="fdl-spec"><div className="k">Network</div><div className="v mint">ElectrumX · US / EU / CA</div></div>
            <div className="fdl-spec"><div className="k">Delivery</div><div className="v mint">Static PWA · installable</div></div>
          </div>
        </div>
      </section>

      <footer className="fdl-foot">
        <div className="fdl-wrap fdl-foot__row">
          <div className="fdl-foot__sign">FLIGHTDECK · <b>SYSTEMS NOMINAL</b> · you have control</div>
          <div className="fdl-foot__links">
            <button onClick={start}>Get started</button>
            <a href="https://github.com/cdonnachie/avian-flightdeck" target="_blank" rel="noreferrer">Documentation</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { tag: 'UTXO', color: '#34E2D5', title: 'Coin control', body: 'Pick the exact UTXOs a transaction spends, with six selection strategies from lowest-fee to privacy-first. Nothing is chosen behind your back.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><rect x="3" y="9" width="5" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="5" width="5" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="17" y="12" width="4" height="6" rx="1" fill="none" stroke="#9DB4BC" strokeWidth="1.6" /></svg>) },
  { tag: 'SIGN-IN', color: '#8A8FF2', title: 'Avian Connect', body: 'Sign into dApps and games with a signed challenge. They receive an address and a signature — never a key. Every signature needs your explicit approval.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 12 h9 M10 8 l4 4 -4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><rect x="14" y="5" width="6" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>) },
  { tag: 'MONITOR', color: '#34F5C6', title: 'Watched addresses', body: 'Track cold-storage and hardware-wallet addresses read-only, with balance-change alerts — without importing a single private key.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>) },
  { tag: 'BACKUP', color: '#34E2D5', title: 'Encrypted backups', body: 'Export an encrypted file or a set of scannable QR chunks. Restore the whole wallet — accounts, contacts, history — on any device.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 3 l7 3 v5 c0 5 -3 8 -7 9 c-4 -1 -7 -4 -7 -9 V6 Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9 12 l2 2 4 -4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>) },
  { tag: 'CRYPTO', color: '#8A8FF2', title: 'Message signing', body: 'Prove you control an address with a signature verifiable in Avian Core and any compatible wallet — and encrypt notes to a public key.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 11 V8 a5 5 0 0 1 10 0 v3" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="5" y="11" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>) },
  { tag: 'WALLETS', color: '#34F5C6', title: 'Multiple wallets', body: 'Run several HD wallets side by side — legacy, native SegWit, or descriptor-imported — and switch between them without re-entering the app.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7 9 h14 v10 a1 1 0 0 1 -1 1 H8" fill="none" stroke="#9DB4BC" strokeWidth="1.5" /></svg>) },
  { tag: 'ASSETS', color: '#8A8FF2', title: 'Avian assets', body: 'Hold, send, and issue Avian assets — main, sub, and unique — with IPFS artwork and reissue. Your history names every move: issued, reissued, sent, received.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 6 v5 c0 1.7 3.1 3 7 3 s7 -1.3 7 -3 V6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 11 v5 c0 1.7 3.1 3 7 3 s7 -1.3 7 -3 v-5" fill="none" stroke="#9DB4BC" strokeWidth="1.5" /></svg>) },
  { tag: 'CO-SIGN', color: '#34E2D5', title: 'PSBT & co-signing', body: 'Build a transaction here, sign it in Avian Core or on an air-gapped device, then broadcast. FlightDeck finalises FORKID inputs so Core accepts the result.', icon: (<svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 3 h7 l4 4 v14 H7 Z" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M14 3 v4 h4" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9 16 c1 -2 2 -2 3 0 s2 2 3 0" fill="none" stroke="#9DB4BC" strokeWidth="1.5" strokeLinecap="round" /></svg>) },
];

const CHECKS = [
  { title: 'Encrypted at rest', body: 'Your private keys and recovery phrase are sealed with Argon2id and AES-256-GCM, and only ever decrypted in memory when you authorise an action.' },
  { title: 'Nothing phones home', body: 'There is no backend and no account. The app talks only to public ElectrumX servers to read balances and broadcast the transactions you sign.' },
  { title: 'Signatures need your say-so', body: 'Sending, exporting a key, and every dApp signature pass through an explicit approval screen and a fresh password or biometric check.' },
  { title: 'Only you can recover you', warn: true, body: 'No password reset, no support line that can move your coins. Keep your backup somewhere safe — losing it loses the wallet, and that is the price of holding your own keys.' },
];

const CSS = `
.fdl{--night:#0D1B21;--panel:#0F2027;--panel-2:#122730;--panel-3:#163139;--line:#24404A;--line-soft:#1A333B;--ink:#E6F0F2;--muted:#9DB4BC;--faint:#4D5E68;--mint:#34F5C6;--turq:#34E2D5;--cyan:#17A7B6;--indigo:#6B8FF0;--violet:#8A8FF2;--sky:#16525C;--sky-2:#123E46;--ground:#1A1F52;--ground-2:#12163A;--grad:linear-gradient(135deg,var(--mint),var(--cyan));--sans:var(--font-inter),-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--mono:var(--font-roboto-mono),ui-monospace,Consolas,monospace;
  min-height:100vh;background:radial-gradient(1100px 620px at 80% -8%,rgba(52,245,198,0.06),transparent 60%),var(--night);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased;}
.fdl *{box-sizing:border-box;}
.fdl .tnum{font-variant-numeric:tabular-nums;}
.fdl-wrap{max-width:1160px;margin:0 auto;padding:0 24px;}
.fdl-label{font-family:var(--mono);font-size:0.66rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);}
.fdl-lamp{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 2px rgba(52,245,198,0.15),0 0 10px 1px rgba(52,245,198,0.85);flex:none;}
.fdl-lamp--indigo{background:var(--indigo);box-shadow:0 0 0 2px rgba(107,143,240,0.15),0 0 10px 1px rgba(107,143,240,0.85);}
.fdl-lamp--turq{background:var(--turq);box-shadow:0 0 0 2px rgba(52,226,213,0.15),0 0 10px 1px rgba(52,226,213,0.85);}
.fdl-btn{display:inline-flex;align-items:center;gap:9px;padding:12px 20px;border-radius:10px;font-family:var(--mono);font-size:0.8rem;letter-spacing:0.04em;font-weight:600;border:1px solid transparent;cursor:pointer;transition:transform .14s,box-shadow .2s,background .15s;}
.fdl-btn--go{background:var(--grad);color:#06232A;box-shadow:0 8px 24px -10px rgba(52,245,198,0.5);}
.fdl-btn--go:hover{transform:translateY(-1px);box-shadow:0 12px 30px -10px rgba(52,245,198,0.7);}
.fdl-btn--ghost{background:var(--panel-2);color:var(--ink);border-color:var(--line);}
.fdl-btn--ghost:hover{border-color:var(--mint);color:var(--mint);}
.fdl-topbar{border-bottom:1px solid var(--line-soft);position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--night) 88%,transparent);backdrop-filter:blur(8px);}
.fdl-topbar__row{display:flex;align-items:center;justify-content:space-between;height:64px;}
.fdl-brand{display:flex;align-items:center;gap:11px;}
.fdl-brand__mark{width:30px;height:30px;}
.fdl-brand__name{font-family:var(--mono);font-weight:600;letter-spacing:0.02em;font-size:0.9rem;}
.fdl-brand__name b{color:var(--mint);}
.fdl-hero{padding:56px 0 40px;}
.fdl-hero__grid{display:grid;grid-template-columns:1.05fr 0.95fr;gap:44px;align-items:center;}
.fdl-eyebrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px;}
.fdl-tag{font-family:var(--mono);font-size:0.64rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line-soft);border-radius:6px;padding:5px 9px;}
.fdl-tag b{color:var(--ink);}
.fdl-display{font-size:clamp(2.4rem,5.4vw,3.9rem);line-height:1.04;letter-spacing:-0.02em;font-weight:800;margin:0 0 20px;text-wrap:balance;}
.fdl-grad{background:linear-gradient(135deg,var(--mint),var(--cyan) 55%,var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;}
.fdl-lede{color:var(--muted);font-size:1.04rem;max-width:52ch;margin:0 0 28px;}
.fdl-lede b{color:var(--ink);font-weight:600;}
.fdl-cta{display:flex;flex-wrap:wrap;gap:12px;}
.fdl-pfd{border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,var(--panel-3),var(--panel-2));padding:16px;box-shadow:0 40px 80px -50px rgba(0,0,0,0.9);}
.fdl-pfd__screen{position:relative;aspect-ratio:4/3.1;border-radius:14px;overflow:hidden;border:1px solid rgba(230,240,242,0.08);}
.fdl-horizon{position:absolute;inset:0;transform-origin:50% 58%;animation:fdl-level 1.8s cubic-bezier(0.16,0.84,0.3,1) both;will-change:transform;}
.fdl-horizon__sky{position:absolute;inset:0 0 42% 0;background:linear-gradient(180deg,var(--sky),var(--sky-2));}
.fdl-horizon__ground{position:absolute;inset:58% 0 0 0;background:linear-gradient(180deg,var(--ground),var(--ground-2));}
.fdl-horizon__line{position:absolute;left:0;right:0;top:58%;height:2px;background:var(--mint);opacity:0.6;box-shadow:0 0 14px rgba(52,245,198,0.6);}
.fdl-ladder{position:absolute;top:58%;left:50%;pointer-events:none;}
.fdl-ladder span{position:absolute;left:0;transform:translateX(-50%);height:2px;border-radius:2px;background:var(--mint);opacity:0.26;}
.fdl-roll{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:2;}
/* the horizon levels once on load — from a slight bank/pitch to wings-level — then holds. It is
   oversized during the roll so the tilt never reveals a screen edge; the fixed roll scale and
   aircraft symbol sit on top and read against it like an attitude indicator. */
@keyframes fdl-level{from{transform:scale(1.16) translateY(-3.4%) rotate(-5deg);}to{transform:scale(1) translateY(0) rotate(0deg);}}
.fdl-aircraft{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);z-index:2;}
.fdl-ann{position:absolute;top:14px;display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink);padding:5px 9px;border-radius:6px;background:rgba(4,18,26,0.5);border:1px solid rgba(230,240,242,0.1);}
.fdl-ann--l{left:14px;}
.fdl-ann--r{right:14px;}
.fdl-pfd__band{position:absolute;left:0;right:0;bottom:0;padding:16px 18px;background:linear-gradient(0deg,rgba(4,18,26,0.85),transparent);}
.fdl-readout{font-family:var(--mono);font-weight:600;font-size:clamp(1.7rem,4vw,2.4rem);line-height:1;color:var(--turq);text-shadow:0 0 22px rgba(52,226,213,0.35);}
.fdl-readout small{font-size:0.4em;color:var(--muted);margin-left:8px;letter-spacing:0.06em;}
.fdl-annun{border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);background:var(--panel);}
.fdl-annun__row{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;}
.fdl-annun__cell{display:flex;align-items:flex-start;gap:10px;padding:20px 8px;}
.fdl-annun__cell .fdl-t{font-size:0.86rem;font-weight:600;}
.fdl-annun__cell .fdl-t small{display:block;color:var(--muted);font-weight:400;font-size:0.74rem;margin-top:3px;}
.fdl-annun__cell .fdl-lamp{margin-top:5px;}
.fdl-section{padding:64px 0;}
.fdl-head{max-width:60ch;margin-bottom:34px;}
.fdl-head h2{font-size:clamp(1.5rem,3vw,2.1rem);letter-spacing:-0.01em;margin:12px 0 10px;font-weight:700;text-wrap:balance;}
.fdl-head p{color:var(--muted);margin:0;}
.fdl-cluster{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.fdl-gauge{position:relative;border-radius:14px;border:1px solid var(--line-soft);background:var(--panel-2);padding:22px;}
.fdl-gauge__tag{position:absolute;top:16px;right:16px;font-family:var(--mono);font-size:0.58rem;letter-spacing:0.12em;color:var(--faint);}
.fdl-gauge__face{width:44px;height:44px;border-radius:11px;background:var(--panel-3);border:1px solid var(--line);display:grid;place-items:center;margin-bottom:16px;}
.fdl-gauge h3{margin:0 0 8px;font-size:1.05rem;}
.fdl-gauge p{margin:0;color:var(--muted);font-size:0.88rem;line-height:1.55;}
.fdl-preflight{background:linear-gradient(180deg,transparent,rgba(15,32,39,0.5));border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);}
.fdl-checklist{display:grid;gap:10px;}
.fdl-check{display:grid;grid-template-columns:34px 1fr auto;gap:16px;align-items:start;padding:16px 18px;border-radius:12px;border:1px solid var(--line-soft);background:var(--panel-2);}
.fdl-check__box{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:rgba(52,245,198,0.12);color:var(--mint);border:1px solid rgba(52,245,198,0.3);margin-top:2px;}
.fdl-check__box.warn{background:rgba(242,196,107,0.12);color:#F2C46B;border-color:rgba(242,196,107,0.3);}
.fdl-check__title{font-weight:600;font-size:0.94rem;margin-bottom:3px;}
.fdl-check__desc{color:var(--muted);font-size:0.85rem;line-height:1.55;}
.fdl-check__state{font-family:var(--mono);font-size:0.66rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--mint);align-self:center;}
.fdl-check__state.warn{color:#F2C46B;}
.fdl-specs{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
.fdl-spec{border-radius:12px;border:1px solid var(--line-soft);background:var(--panel-2);padding:16px;}
.fdl-spec .k{font-family:var(--mono);font-size:0.62rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}
.fdl-spec .v{font-family:var(--mono);font-size:0.82rem;color:var(--ink);}
.fdl-spec .v.mint{color:var(--mint);}
.fdl-foot{border-top:1px solid var(--line-soft);padding:26px 0;}
.fdl-foot__row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;}
.fdl-foot__sign{font-family:var(--mono);font-size:0.72rem;letter-spacing:0.06em;color:var(--muted);}
.fdl-foot__sign b{color:var(--mint);}
.fdl-foot__links{display:flex;gap:18px;}
.fdl-foot__links a,.fdl-foot__links button{color:var(--muted);font-size:0.82rem;text-decoration:none;background:none;border:none;cursor:pointer;font-family:var(--sans);padding:0;}
.fdl-foot__links a:hover,.fdl-foot__links button:hover{color:var(--mint);}
.fdl :focus-visible{outline:2px solid var(--mint);outline-offset:2px;border-radius:4px;}
@media (max-width:900px){.fdl-hero__grid{grid-template-columns:1fr;gap:32px;}.fdl-annun__row{grid-template-columns:1fr 1fr;}.fdl-cluster{grid-template-columns:1fr 1fr;}.fdl-specs{grid-template-columns:1fr 1fr;}}
@media (max-width:560px){.fdl-annun__row{grid-template-columns:1fr;}.fdl-cluster{grid-template-columns:1fr;}.fdl-specs{grid-template-columns:1fr;}.fdl-check{grid-template-columns:34px 1fr;}.fdl-check__state{grid-column:2;justify-self:start;}}
@media (prefers-reduced-motion:reduce){.fdl *{transition:none!important;animation:none!important;}}
`;
