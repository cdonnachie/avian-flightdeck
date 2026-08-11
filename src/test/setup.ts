/**
 * Global test setup.
 *
 * The suite runs in the `node` environment rather than jsdom on purpose: jsdom installs its own
 * typed-array constructors, and bitcoinjs/ecpair validate their inputs with `instanceof`, so the
 * realm mismatch makes every key operation fail with "ecc library invalid". Instead of a full DOM
 * we shim the handful of browser APIs the services actually reach for — web storage, a minimal
 * window and navigator — which keeps the crypto libraries on Node's own realm.
 */

import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, vi } from 'vitest';

// StorageService and BackupService raise user-facing toasts. Those need a real DOM to inject a
// stylesheet into, and are irrelevant to service behaviour, so the library is stubbed for the
// whole suite.
vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

// The backing map lives outside the instance so it is not an own enumerable property — real web
// storage exposes only stored keys, and code that enumerates localStorage must see the same.
const backingStore = new WeakMap<MemoryStorage, Map<string, string>>();

class MemoryStorage implements Storage {
  constructor() {
    backingStore.set(this, new Map<string, string>());
  }

  private get entries(): Map<string, string> {
    return backingStore.get(this) as Map<string, string>;
  }

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.has(key) ? (this.entries.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

const define = (name: string, value: unknown) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

const localStorageShim = new MemoryStorage();
const sessionStorageShim = new MemoryStorage();
define('localStorage', localStorageShim);
define('sessionStorage', sessionStorageShim);

// SecurityService branches on navigator.platform and userAgent when describing a biometric
// credential, and Node's built-in navigator has neither.
define('navigator', {
  userAgent: 'AvianFlightDeckTests/1.0 (Windows NT 10.0; Win64; x64)',
  platform: 'Win32',
  language: 'en-GB',
});

// A minimal window: an EventTarget with the few properties the services read. Services guard on
// `typeof window !== 'undefined'`, so providing this switches them onto their browser paths —
// which is exactly the code we want under test.
if (typeof globalThis.window === 'undefined') {
  const target = new EventTarget();
  define(
    'window',
    Object.assign(target, {
      localStorage: localStorageShim,
      sessionStorage: sessionStorageShim,
      location: {
        hostname: 'localhost',
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
        protocol: 'http:',
      },
      navigator: globalThis.navigator,
      // DataWipeService feature-detects storage APIs via `'indexedDB' in window`.
      indexedDB: globalThis.indexedDB,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    }),
  );
}

// SecurityService attaches activity listeners to `document` from its constructor, so the module
// cannot even be imported without one.
if (typeof globalThis.document === 'undefined') {
  const docTarget = new EventTarget();
  define(
    'document',
    Object.assign(docTarget, {
      addEventListener: docTarget.addEventListener.bind(docTarget),
      removeEventListener: docTarget.removeEventListener.bind(docTarget),
      dispatchEvent: docTarget.dispatchEvent.bind(docTarget),
      visibilityState: 'visible',
      hidden: false,
    }),
  );
}

if (typeof globalThis.crypto?.randomUUID !== 'function') {
  define('crypto', webcrypto);
}

// structuredClone is how fake-indexeddb snapshots stored records.
if (typeof globalThis.structuredClone !== 'function') {
  define('structuredClone', (value: unknown) => JSON.parse(JSON.stringify(value)));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
