import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node, not jsdom — see the comment at the top of src/test/setup.ts. The browser APIs the
    // services need are shimmed there; jsdom breaks the secp256k1 libraries.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Key derivation (scrypt, BIP39) is deliberately slow; a few suites need room.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
