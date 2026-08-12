/**
 * Dev-only benchmark for choosing the scrypt work factors used by at-rest encryption
 * (see docs/proposals/scrypt-kdf-hardening.md and src/services/wallet/encryption.ts).
 *
 * Times key derivation for a few candidate (N, r) profiles and prints the wall-clock time and the
 * memory each needs (≈ 128 · N · r bytes). Pick the highest profile that stays roughly in the
 * 250–750 ms band AND within a safe memory budget on your *slowest* target device.
 *
 * This measures only the machine it runs on. Desktop Node is a rough upper bound on speed; a
 * phone will be slower and its memory ceiling is the real constraint — validate there too (e.g. by
 * temporarily logging derivation time from the running PWA on a real handset).
 *
 *   node scripts/bench-scrypt.cjs            # default password length
 *   node scripts/bench-scrypt.cjs "some password"
 */

const { scrypt } = require('scrypt-js');
const { randomBytes } = require('crypto');

const PROFILES = [
  { N: 16384, r: 8, p: 1 }, // current v1 — too weak, shown for reference
  { N: 32768, r: 8, p: 1 },
  { N: 65536, r: 8, p: 1 }, // current v2 candidate
  { N: 131072, r: 8, p: 1 },
];

const DK_LEN = 32;
const RUNS = 5;

function memoryMB(N, r) {
  return (128 * N * r) / (1024 * 1024);
}

async function timeOne(password, N, r, p) {
  const salt = randomBytes(64);
  const pw = Buffer.from(password, 'utf-8');
  const start = process.hrtime.bigint();
  await scrypt(pw, salt, N, r, p, DK_LEN);
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

async function main() {
  const password = process.argv[2] || 'a-fairly-typical-user-password-123';
  console.log(`\nscrypt derivation benchmark — password length ${password.length}, ${RUNS} runs each\n`);
  console.log('  N        r   p   memory     median      min      max');
  console.log('  ' + '-'.repeat(58));

  for (const { N, r, p } of PROFILES) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      times.push(await timeOne(password, N, r, p));
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const fmt = (n) => `${n.toFixed(0).padStart(6)} ms`;
    console.log(
      `  ${String(N).padStart(7)}  ${r}   ${p}   ${memoryMB(N, r).toFixed(0).padStart(4)} MB   ` +
        `${fmt(median)}  ${fmt(times[0])}  ${fmt(times[times.length - 1])}`,
    );
  }

  console.log('\nTarget: highest profile with median ~250–750 ms and memory your slowest device tolerates.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
