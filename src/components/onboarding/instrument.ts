/**
 * Shared "flight-deck instrument" styles for the onboarding surface (the method screen, the create
 * wizard, import, restore, and the armed/success state). Injected once by the onboarding page via a
 * <style> tag — the same self-contained, committed-dark approach the landing page uses — and keyed
 * to the app's already-loaded Inter / Roboto Mono via the CSS variables layout.tsx sets. Scoped
 * under `.ob` so nothing leaks into the rest of the app.
 */
export const ONBOARDING_CSS = `
.ob{
  --night:#0D1B21;--panel:#0F2027;--panel-2:#122730;--panel-3:#163139;--line:#24404A;--line-soft:#1A333B;
  --ink:#E6F0F2;--muted:#9DB4BC;--faint:#4D5E68;--mint:#34F5C6;--turq:#34E2D5;--cyan:#17A7B6;--indigo:#6B8FF0;--violet:#8A8FF2;--amber:#F2C46B;--rose:#F0768A;
  --grad:linear-gradient(135deg,#34F5C6,#17A7B6);
  --sans:var(--font-inter),-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--mono:var(--font-roboto-mono),ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  min-height:100vh;background:radial-gradient(1100px 640px at 82% -10%,rgba(52,245,198,0.06),transparent 60%),var(--night);
  color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased;
}
.ob *{box-sizing:border-box;}
.ob-wrap{max-width:1060px;margin:0 auto;padding:0 24px;}
.ob-stage{padding:38px 24px 56px;}
.ob-label{font-family:var(--mono);font-size:0.66rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--muted);}
.ob-lamp{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 2px rgba(52,245,198,0.15),0 0 10px 1px rgba(52,245,198,0.85);flex:none;}
.ob-lamp--turq{background:var(--turq);box-shadow:0 0 0 2px rgba(52,226,213,0.15),0 0 10px 1px rgba(52,226,213,0.8);}
.ob-lamp--indigo{background:var(--indigo);box-shadow:0 0 0 2px rgba(107,143,240,0.15),0 0 10px 1px rgba(107,143,240,0.8);}

.ob-top{border-bottom:1px solid var(--line-soft);position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--night) 88%,transparent);backdrop-filter:blur(8px);}
.ob-top__row{display:flex;align-items:center;justify-content:space-between;height:62px;}
.ob-brand{display:flex;align-items:center;gap:11px;}
.ob-brand__mark{width:28px;height:28px;}
.ob-brand__name{font-family:var(--mono);font-weight:600;letter-spacing:0.02em;font-size:0.88rem;}
.ob-brand__name b{color:var(--mint);}
.ob-top__tag{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:0.64rem;letter-spacing:0.12em;color:var(--muted);}

.ob-console{display:grid;grid-template-columns:250px 1fr;gap:26px;align-items:start;}
.ob-rail{position:sticky;top:90px;border:1px solid var(--line-soft);background:var(--panel);border-radius:16px;padding:20px 18px;}
.ob-seq{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:4px;}
.ob-seq li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;border:1px solid transparent;color:var(--muted);}
.ob-seq__no{font-family:var(--mono);font-size:0.7rem;color:var(--faint);}
.ob-seq__t{font-size:0.86rem;font-weight:600;color:inherit;line-height:1.25;}
.ob-seq__t small{display:block;font-weight:400;font-size:0.72rem;color:var(--faint);margin-top:2px;}
.ob-seq__dot{width:8px;height:8px;border-radius:50%;background:var(--line);}
.ob-seq li.done{color:var(--ink);}
.ob-seq li.done .ob-seq__dot{background:var(--mint);box-shadow:0 0 8px rgba(52,245,198,0.7);}
.ob-seq li.done .ob-seq__no{color:var(--mint);}
.ob-seq li.active{color:var(--ink);background:var(--panel-2);border-color:var(--line);}
.ob-seq li.active .ob-seq__dot{background:var(--turq);box-shadow:0 0 10px rgba(52,226,213,0.9);}
.ob-seq li.active .ob-seq__no{color:var(--turq);}
.ob-rail__note{display:flex;gap:9px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line-soft);color:var(--muted);font-size:0.74rem;line-height:1.5;}
.ob-rail__note svg{color:var(--amber);flex:none;margin-top:2px;}

.ob-panel{border:1px solid var(--line);background:linear-gradient(180deg,var(--panel-3),var(--panel-2));border-radius:18px;padding:30px 30px 26px;box-shadow:0 40px 80px -55px rgba(0,0,0,0.9);}
.ob-solo{max-width:600px;margin:0 auto;}
.ob-head{margin-bottom:24px;}
.ob-head h1{font-size:clamp(1.5rem,3vw,2rem);letter-spacing:-0.01em;font-weight:800;margin:11px 0 10px;text-wrap:balance;}
.ob-head h2{font-size:1.4rem;letter-spacing:-0.01em;font-weight:700;margin:9px 0 0;}
.ob-head p{color:var(--muted);margin:8px 0 0;max-width:52ch;}
.ob-head--sm{margin-bottom:18px;}
.ob-lede{color:var(--muted);font-size:0.92rem;margin:0 0 18px;max-width:56ch;}
.ob-lede b{color:var(--ink);}

.ob-methods{display:grid;gap:12px;}
.ob-tile{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;text-align:left;width:100%;padding:18px;border-radius:14px;border:1px solid var(--line);background:var(--panel-2);cursor:pointer;transition:border-color .15s,transform .14s,background .15s;color:var(--ink);font-family:inherit;}
.ob-tile:hover{transform:translateY(-1px);border-color:var(--mint);}
.ob-tile--go{border-color:rgba(52,245,198,0.35);background:linear-gradient(180deg,rgba(52,245,198,0.06),var(--panel-2));}
.ob-tile__ic{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--panel-3);border:1px solid var(--line);flex:none;color:var(--turq);}
.ob-tile__ic--go{color:#0D1B21;background:linear-gradient(135deg,var(--mint),var(--cyan));border-color:transparent;}
.ob-tile__body b{display:block;font-size:1.02rem;margin-bottom:3px;}
.ob-tile__body small{color:var(--muted);font-size:0.85rem;line-height:1.5;}
.ob-tile__go{font-family:var(--mono);color:var(--mint);font-size:1.1rem;}
.ob-methods__sub{margin-top:26px;padding-top:22px;border-top:1px solid var(--line-soft);}
.ob-imports{display:grid;gap:9px;}
.ob-irow{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;text-align:left;width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--line-soft);background:var(--panel-2);cursor:pointer;color:var(--ink);font-family:inherit;transition:border-color .15s,transform .14s;}
.ob-irow:hover{border-color:var(--mint);transform:translateY(-1px);}
.ob-irow__t b{display:block;font-size:0.94rem;margin-bottom:2px;}
.ob-irow__t small{color:var(--muted);font-size:0.8rem;}
.ob-irow__go{font-family:var(--mono);color:var(--muted);}
.ob-irow:hover .ob-irow__go{color:var(--mint);}

.ob-strip{display:flex;gap:6px;margin-bottom:24px;}
.ob-strip span{height:3px;flex:1;border-radius:3px;background:var(--line);transition:background .2s;}
.ob-strip span.on{background:var(--grad);}

.ob-field{display:block;margin-bottom:18px;}
.ob-field__lbl{display:block;font-size:0.82rem;font-weight:600;color:var(--ink);margin-bottom:8px;}
.ob-field__row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.ob-field__row .ob-field__lbl{margin-bottom:0;}
.ob-input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(4,18,26,0.55);color:var(--ink);font-family:var(--mono);font-size:0.92rem;transition:border-color .15s;}
.ob-input::placeholder{color:var(--faint);}
.ob-input:focus{outline:none;border-color:var(--mint);}
.ob-inwrap{position:relative;}
.ob-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;}
.ob-eye:hover{color:var(--ink);}
.ob-hint{display:block;color:var(--faint);font-size:0.76rem;margin-top:8px;}
.ob-err{color:var(--rose);font-size:0.78rem;margin:8px 0 0;}

.ob-seg{display:flex;gap:4px;padding:4px;border-radius:11px;border:1px solid var(--line);background:rgba(4,18,26,0.5);}
.ob-seg button{flex:1;padding:10px;border-radius:8px;border:none;background:none;color:var(--muted);font-family:var(--mono);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all .15s;}
.ob-seg button.is-on{background:rgba(52,245,198,0.14);color:var(--mint);box-shadow:inset 0 0 0 1px rgba(52,245,198,0.3);}

.ob-seedwrap{position:relative;margin-bottom:14px;}
.ob-seed{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;transition:filter .2s;}
.ob-seed.blur{filter:blur(7px);user-select:none;pointer-events:none;}
.ob-word{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:8px;border:1px solid var(--line-soft);background:rgba(4,18,26,0.4);}
.ob-word i{width:18px;text-align:right;font-family:var(--mono);font-size:0.7rem;color:var(--faint);font-style:normal;}
.ob-word b{font-family:var(--mono);font-size:0.86rem;font-weight:500;}
.ob-reveal{position:absolute;inset:0;margin:auto;height:44px;width:max-content;padding:0 18px;display:inline-flex;align-items:center;gap:9px;border-radius:10px;border:1px solid var(--line);background:var(--panel-3);color:var(--ink);font-family:var(--mono);font-size:0.82rem;font-weight:600;cursor:pointer;}
.ob-reveal svg{color:var(--mint);}
.ob-reveal:hover{border-color:var(--mint);}
.ob-warn{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;border:1px solid rgba(242,196,107,0.3);background:rgba(242,196,107,0.09);color:var(--ink);font-size:0.83rem;line-height:1.5;margin-bottom:14px;}
.ob-warn svg{color:var(--amber);flex:none;margin-top:2px;}
.ob-seedbar{display:flex;justify-content:space-between;margin-bottom:14px;}
.ob-mini{display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:var(--mint);font-family:var(--mono);font-size:0.76rem;font-weight:600;cursor:pointer;padding:6px 4px;}
.ob-mini--muted{color:var(--muted);}
.ob-mini:hover{filter:brightness(1.15);}
.ob-back{margin-bottom:16px;}
.ob-arm{display:flex;align-items:center;gap:11px;cursor:pointer;font-size:0.87rem;padding:12px 14px;border-radius:10px;border:1px solid var(--line-soft);background:var(--panel-2);}
.ob-arm input{width:17px;height:17px;accent-color:#34F5C6;flex:none;}
.ob-arm input:disabled{opacity:0.4;}

.ob-slots{display:flex;gap:10px;margin-bottom:16px;}
.ob-slot{flex:1;border-radius:10px;border:1px dashed var(--line);background:rgba(4,18,26,0.4);padding:11px 6px;text-align:center;cursor:pointer;transition:all .14s;color:var(--ink);font-family:inherit;}
.ob-slot.filled{border-style:solid;border-color:var(--mint);background:rgba(52,245,198,0.08);}
.ob-slot small{display:block;font-family:var(--mono);font-size:0.6rem;color:var(--faint);margin-bottom:4px;}
.ob-slot b{font-family:var(--mono);font-size:0.9rem;font-weight:500;color:var(--ink);}
.ob-bank{display:flex;flex-wrap:wrap;gap:8px;}
.ob-bankw{border-radius:8px;border:1px solid var(--line-soft);background:var(--panel-2);color:var(--ink);font-family:var(--mono);font-size:0.85rem;padding:8px 13px;cursor:pointer;transition:all .14s;}
.ob-bankw:hover:not(:disabled){border-color:var(--mint);color:var(--mint);}
.ob-bankw:disabled{opacity:0.35;cursor:default;}

.ob-meter{height:5px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:10px;}
.ob-meter i{display:block;height:100%;width:0;border-radius:3px;background:var(--rose);transition:width .2s,background .2s;}
.ob-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;border:1px solid rgba(52,245,198,0.22);background:rgba(52,245,198,0.06);color:var(--ink);font-size:0.83rem;line-height:1.5;}
.ob-note svg{color:var(--mint);flex:none;margin-top:2px;}
.ob-note b{color:var(--mint);}

.ob-restore{display:grid;gap:14px;}
.ob-restore__file{border:1px solid var(--line-soft);background:var(--panel-2);border-radius:12px;padding:16px;}
.ob-file{background:rgba(4,18,26,0.5);border-color:var(--line);color:var(--ink);}

.ob-nav{display:flex;gap:12px;margin-top:26px;padding-top:22px;border-top:1px solid var(--line-soft);}
.ob-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 22px;border-radius:10px;font-family:var(--mono);font-size:0.8rem;letter-spacing:0.04em;font-weight:600;border:1px solid transparent;cursor:pointer;transition:transform .14s,box-shadow .2s,background .15s,opacity .15s;}
.ob-btn--go{background:var(--grad);color:#06232A;box-shadow:0 8px 24px -10px rgba(52,245,198,0.5);margin-left:auto;}
.ob-btn--go:hover{transform:translateY(-1px);box-shadow:0 12px 30px -10px rgba(52,245,198,0.7);}
.ob-btn--go:disabled{opacity:0.4;cursor:not-allowed;transform:none;box-shadow:none;}
.ob-btn--ghost{background:var(--panel-2);color:var(--ink);border-color:var(--line);}
.ob-btn--ghost:hover{border-color:var(--mint);color:var(--mint);}

.ob-done{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:44px 30px;}
.ob-done__badge{width:76px;height:76px;border-radius:20px;display:grid;place-items:center;color:var(--mint);background:rgba(52,245,198,0.1);border:1px solid rgba(52,245,198,0.3);box-shadow:0 0 40px -8px rgba(52,245,198,0.4);}
.ob-done h2{font-size:1.7rem;font-weight:800;margin:6px 0 0;}
.ob-done__lede{text-align:center;max-width:44ch;margin-inline:auto;}
.ob-done__sign{font-family:var(--mono);font-size:0.72rem;letter-spacing:0.1em;color:var(--muted);display:inline-flex;align-items:center;gap:8px;}

.ob :focus-visible{outline:2px solid var(--mint);outline-offset:2px;border-radius:6px;}

@media (max-width:820px){
  .ob-console{grid-template-columns:1fr;}
  .ob-rail{display:none;}
  .ob-panel{padding:24px 20px;}
  .ob-seed{grid-template-columns:repeat(2,1fr);}
}
@media (prefers-reduced-motion:reduce){.ob *{transition:none!important;}}
`;
