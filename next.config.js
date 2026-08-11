/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: false,
  buildExcludes: [/app-build-manifest\.json$/],
  navigationPreload: true,
  publicExcludes: ['**/api/**/*'],
  runtimeCaching: [
    {
      // cache any .wasm artifact
      urlPattern: /\.wasm$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'wasm-cache',
        expiration: { maxEntries: 10 },
      },
    },
    {
      // Exclude API routes from service worker handling
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
    {
      // Cache external API responses only
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'external-api-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      },
    },
  ],
});

const nextConfig = {
  // Enable TypeScript strict mode
  typescript: {
    ignoreBuildErrors: false,
  },
  // The wallet is entirely client-side: no API routes, no server components that need a runtime,
  // no server-side data fetching. `export` therefore emits a plain folder of static files in
  // out/, which any web server can serve — see docs/DEPLOY.md.
  output: 'export',
  // Image Optimization is a server feature and has no equivalent in a static export.
  images: {
    unoptimized: true,
  },
  // Emit out/settings/wallet/index.html rather than out/settings/wallet.html, so a plain
  // `try_files $uri $uri/index.html` serves deep links without per-route rules.
  trailingSlash: true,
  poweredByHeader: false,
  compress: true,
  // Transpile ESM crypto libraries
  transpilePackages: [
    'bitcoinjs-lib',
    'ecpair',
    'bip32',
    'bip39',
    'tiny-secp256k1',
    'bs58check',
    'bs58',
    'base-x',
    'wif',
    'coinselect',
    'bech32',
    'typeforce',
    'varuint-bitcoin',
    'pushdata-bitcoin',
    'bitcoin-ops',
    'create-hash',
    'create-hmac',
    'randombytes',
    'safe-buffer',
    'secp256k1',
  ],
  // Webpack configuration for WebAssembly support
  webpack: (config, { isServer }) => {
    // Enable WebAssembly experiments
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Use node-polyfill-webpack-plugin for automatic Node.js core polyfills
    if (!isServer) {
      const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'tiny-secp256k1': require.resolve('@bitcoin-js/tiny-secp256k1-asmjs'),
      };
      config.plugins.push(
        new NodePolyfillPlugin({
          excludeAliases: ['console'],
        }),
      );
    }

    return config;
  },
};

module.exports = withPWA(nextConfig);
