/**
 * Dev-only benchmark for choosing the Argon2id work factors used by at-rest encryption
 * (see docs/proposals/argon2id-kdf.md and src/services/wallet/encryption.ts).
 *
 * Times key derivation for a few candidate (m, t) profiles and prints wall-clock time. `m` is
 * memory in KiB, `t` iterations, `p` parallelism (kept at 1). Pick the highest profile that stays
 * roughly in the 250-750 ms band AND within a safe memory budget on your *slowest* target device.
 *
 * Argon2id runs as WASM, so these node figures are a much closer proxy for the browser than the
 * pure-JS scrypt benchmark was — but still validate on a real handset (its memory ceiling is the
 * real constraint).
 *
 *   node scripts/bench-argon2.mjs            # default password length
 *   node scripts/bench-argon2.mjs "some password"
 */

import { argon2id } from 'hash-wasm';
import { randomBytes } from 'crypto';

const PROFILES = [
  { m: 32768, t: 3 },
  { m: 65536, t: 3 }, // current default
  { m: 65536, t: 4 },
  { m: 131072, t: 3 },
];

const RUNS = 5;

async function timeOne(password, m, t) {
  const salt = randomBytes(64);
  const start = process.hrtime.bigint();
  await argon2id({
    password: Buffer.from(password, 'utf-8'),
    salt,
    parallelism: 1,
    iterations: t,
    memorySize: m,
    hashLength: 32,
    outputType: 'binary',
  });
  return Number(process.hrtime.bigint() - start) / 1e6; // ms
}

async function main() {
  const password = process.argv[2] || 'a-fairly-typical-user-password-123';
  console.log(`\nArgon2id derivation benchmark — password length ${password.length}, ${RUNS} runs each\n`);
  console.log('  m (KiB)   t   p   memory     median      min      max');
  console.log('  ' + '-'.repeat(58));

  for (const { m, t } of PROFILES) {
    const times = [];
    for (let i = 0; i < RUNS; i++) times.push(await timeOne(password, m, t));
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const fmt = (n) => `${n.toFixed(0).padStart(6)} ms`;
    console.log(
      `  ${String(m).padStart(7)}  ${t}   1   ${String(m / 1024).padStart(4)} MB   ` +
        `${fmt(median)}  ${fmt(times[0])}  ${fmt(times[times.length - 1])}`,
    );
  }

  console.log('\nTarget: highest profile with median ~250-750 ms and memory your slowest device tolerates.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
