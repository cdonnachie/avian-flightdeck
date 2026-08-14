// Generates the Avian FlightDeck app-icon set from the "attitude indicator" mark.
// Rasterises the SVG at every manifest size via headless Chromium (from @playwright/test),
// writes public/favicon.svg + public/icon.svg, and a full-bleed maskable PNG.
//
//   node scripts/gen-icons.mjs
//
// The mark: a primary-flight-display roundel (sky/ground, mint horizon, roll ticks, aircraft
// reference symbol) in the mint->cyan gradient on the committed night ground.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');

const DEFS = `
  <radialGradient id="bg" cx="50%" cy="0%" r="135%">
    <stop offset="0%" stop-color="#1e424c"/><stop offset="52%" stop-color="#112833"/><stop offset="100%" stop-color="#081218"/>
  </radialGradient>
  <linearGradient id="mint" x1="0" y1="0" x2="1" y2="1.1">
    <stop offset="0%" stop-color="#7CFDDF"/><stop offset="50%" stop-color="#34E2D5"/><stop offset="100%" stop-color="#159FB4"/>
  </linearGradient>`;

// The instrument mark on a 512 canvas. Kept within the maskable safe zone (inner ~80%).
const MARK = `
  <circle cx="256" cy="264" r="150" fill="#08161c"/>
  <clipPath id="clip"><circle cx="256" cy="264" r="150"/></clipPath>
  <g clip-path="url(#clip)">
    <rect x="106" y="110" width="300" height="154" fill="#16525C" fill-opacity=".55"/>
    <rect x="106" y="264" width="300" height="154" fill="#191d4e" fill-opacity=".72"/>
    <g fill="url(#mint)" opacity=".28"><rect x="224" y="212" width="64" height="7" rx="3.5"/><rect x="234" y="306" width="44" height="7" rx="3.5"/></g>
    <rect x="106" y="258" width="300" height="11" fill="url(#mint)"/>
  </g>
  <circle cx="256" cy="264" r="150" fill="none" stroke="url(#mint)" stroke-width="12" stroke-opacity=".4"/>
  <g stroke="url(#mint)" stroke-width="7" stroke-linecap="round"><line x1="256" y1="122" x2="256" y2="142"/><line x1="190" y1="134" x2="199" y2="152"/><line x1="322" y1="134" x2="313" y2="152"/></g>
  <g stroke="url(#mint)" stroke-width="16" stroke-linecap="round"><line x1="170" y1="264" x2="224" y2="264"/><line x1="288" y1="264" x2="342" y2="264"/><line x1="224" y1="264" x2="235" y2="282"/><line x1="288" y1="264" x2="277" y2="282"/></g>
  <circle cx="256" cy="264" r="15" fill="#08161c" stroke="url(#mint)" stroke-width="10"/>`;

// rounded: an app-tile with 22% rounded corners (transparent outside). full-bleed: square for maskable.
const svg = ({ size = 512, rounded = true } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">` +
  `<defs>${DEFS}</defs>` +
  `<rect width="512" height="512" ${rounded ? 'rx="114"' : ''} fill="url(#bg)"/>` +
  `${MARK}</svg>`;

const SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512];

async function shoot(page, { size, rounded, opaque, path }) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg({ size, rounded })}</body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: !opaque });
}

const run = async () => {
  await mkdir(iconsDir, { recursive: true });
  // Canonical vector served directly (favicon + metadata icon).
  await writeFile(join(root, 'public', 'favicon.svg'), svg({ rounded: true }) + '\n');

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const size of SIZES) {
    await shoot(page, { size, rounded: true, opaque: false, path: join(iconsDir, `icon-${size}x${size}.png`) });
    process.stdout.write(`icon-${size}x${size}.png  `);
  }
  // Maskable: full-bleed square background so the OS mask never clips to transparency.
  await shoot(page, { size: 512, rounded: false, opaque: true, path: join(iconsDir, 'icon-maskable-512x512.png') });
  // Apple touch icon (iOS ignores transparency; give it the opaque rounded-less square too).
  await shoot(page, { size: 180, rounded: false, opaque: true, path: join(iconsDir, 'apple-touch-icon.png') });
  process.stdout.write('maskable  apple-touch\n');

  await browser.close();
  console.log('done');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
