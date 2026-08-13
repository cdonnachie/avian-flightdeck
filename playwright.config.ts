import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3210);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests. These drive the real app in a real browser, which is the only way to cover
 * the Avian Connect transports: popups, cross-window postMessage and redirect round trips have
 * no meaningful stand-in.
 *
 * Unit and service tests live in src/**\/*.test.ts and run under Vitest — see docs/TESTING.md.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Wallet operations run scrypt in the browser, which is deliberately slow. The e2e build uses a
  // cheap KDF N (NEXT_PUBLIC_SCRYPT_N via build:e2e / test:e2e) so these stay well within timeout.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Each spec seeds its own IndexedDB, so workers must not share a browser profile.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Serves the static export from out/, which is byte-for-byte what gets deployed. Run
    // `pnpm build` first. Set E2E_USE_DEV=1 to iterate against the dev server instead.
    command: process.env.E2E_USE_DEV
      ? `pnpm exec next dev --port ${PORT}`
      : `pnpm exec serve out --listen ${PORT} --no-request-logging`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
