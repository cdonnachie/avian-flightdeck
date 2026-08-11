# Deploying Avian FlightDeck

FlightDeck is a **fully client-side wallet**. There are no API routes, no server components that
need a runtime, and no server-side data fetching — every key, every signature and every byte of
wallet state lives in the browser. `next build` therefore emits a plain folder of static files
(`out/`), and deployment is nothing more than putting that folder behind a web server.

There is no Node process in production, nothing to supervise, and nothing to restart.

## Build

```bash
pnpm install --frozen-lockfile
pnpm build          # writes out/
```

The result is roughly 11 MB. Build on a workstation or in CI — the target host needs no toolchain.

Verify it locally before shipping:

```bash
pnpm start          # serves out/ on http://localhost:3000
```

## Host: an LXC container on Proxmox

A minimal Debian container is plenty. Nothing here is CPU or memory hungry — it is a file server.

| Resource | Suggested |
| -------- | --------- |
| Template | `debian-12-standard` |
| Cores    | 1 |
| RAM      | 512 MB |
| Disk     | 4 GB |
| Type     | Unprivileged |

```bash
# On the Proxmox host
pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname flightdeck \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 \
  --start 1

pct enter 120
```

Inside the container:

```bash
apt update && apt install -y nginx rsync
mkdir -p /var/www/flightdeck
chown -R www-data:www-data /var/www/flightdeck
```

## nginx

`/etc/nginx/sites-available/flightdeck`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name flightdeck.example.com;

    root /var/www/flightdeck;
    index index.html;

    # Routes are exported as directories containing index.html (trailingSlash: true),
    # so this one rule serves every deep link without per-route configuration.
    location / {
        try_files $uri $uri/ $uri/index.html /404.html;
    }

    # The service worker must never be cached, or clients pin themselves to an old
    # build and stop receiving updates. This is the single most important rule here.
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        expires off;
    }

    location ~ ^/workbox-.*\.js$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        expires off;
    }

    # Hashed build assets are immutable and safe to cache hard.
    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location = /manifest.json {
        add_header Cache-Control "public, max-age=3600" always;
    }

    # A wallet should never be framed, and should leak nothing on navigation.
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(self), geolocation=(), microphone=(), payment=()" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

`camera=(self)` is deliberate — the QR scanner needs it.

```bash
ln -s /etc/nginx/sites-available/flightdeck /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## HTTPS is not optional

The wallet needs a secure context to function at all:

- **Web Crypto** (`crypto.subtle`, `getRandomValues`) — key generation and encryption
- **Service worker** — offline support and PWA install
- **WebAuthn** — biometric unlock
- **IndexedDB persistence** — browsers are more willing to keep storage on a secure origin

Over plain HTTP the app will appear to load and then fail in ways that look like bugs. Terminate
TLS either at this container or at whatever reverse proxy already fronts your network.

At the container:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d flightdeck.example.com
```

Behind an existing proxy (Nginx Proxy Manager, Traefik, Caddy, pfSense/HAProxy), point it at this
container on port 80 and let it hold the certificate. Make sure it forwards `X-Forwarded-Proto`
and does not strip the cache headers above.

## Deploy

```bash
pnpm build
rsync -az --delete out/ root@flightdeck:/var/www/flightdeck/
```

`--delete` matters: stale hashed chunks from previous builds otherwise accumulate forever.

For zero-downtime and instant rollback, deploy to a timestamped directory and flip a symlink:

```bash
RELEASE=$(date +%Y%m%d-%H%M%S)
rsync -az out/ root@flightdeck:/var/www/releases/$RELEASE/
ssh root@flightdeck "ln -sfn /var/www/releases/$RELEASE /var/www/flightdeck-current && nginx -s reload"
```

with `root /var/www/flightdeck-current;` in the nginx config. Rolling back is then re-pointing the
symlink at the previous release.

## Outbound connections

The browser talks directly to these; the host itself needs no outbound access beyond updates:

| Destination | Purpose |
| ----------- | ------- |
| `wss://electrum-us.avn.network:50003` | Balances, history, broadcasting |
| `wss://electrum-eu.avn.network:50003` | ” |
| `wss://electrum-ca.avn.network:50003` | ” |
| `https://api.coingecko.com` | AVN price (optional; failure is handled) |

If you add a Content-Security-Policy, `connect-src` must include all of the above, and
`script-src` needs `'wasm-unsafe-eval'` for the secp256k1 build. **Test a CSP against a real
wallet before enforcing it** — a policy that blocks the crypto libraries silently breaks signing.

## Verifying a deployment

1. `curl -I https://flightdeck.example.com/sw.js` → `Cache-Control: no-cache`
2. Load a deep link directly, e.g. `/settings/connected-sites/` → renders, no 404
3. DevTools → Application → Service Workers → activated
4. DevTools → Application → Manifest → installable
5. Create a throwaway wallet, reload, confirm it persists
6. Check the balance updates, which proves the WebSocket reached ElectrumX

## Backups

The server holds **no user data** — it is a static bundle, and rebuilding from git reproduces it
exactly. There is nothing on this host worth backing up beyond the nginx config.

Users are solely responsible for their own wallet backups; see the in-app backup tools. Be aware
that browser IndexedDB can be evicted under storage pressure, so the app's backup prompts are the
only thing standing between a user and a lost wallet.
