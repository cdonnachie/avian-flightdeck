# Deploying Avian FlightDeck Wallet to Vercel

## 🚀 Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cdonnachie/avian-flightdeck)

## 📋 Prerequisites

- Vercel account (free tier works)
- GitHub/GitLab repository with your code
- Node.js 18+ for local development

## 🔧 Deployment Steps

### 1. **Connect Repository**

```bash
# Install Vercel CLI (optional)
pnpm add -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
vercel
```

### 2. **Configure Environment Variables**

In your Vercel dashboard, add these environment variables:

```bash
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
```

### 3. **Automatic Deployment**

- Push to main/master branch
- Vercel automatically builds and deploys
- PWA features work out of the box

## ✅ What Works on Vercel

- ✅ **PWA Installation**: Add to home screen
- ✅ **Service Worker**: Offline functionality
- ✅ **IndexedDB**: Local wallet storage
- ✅ **WebSocket**: ElectrumX connections
- ✅ **HTTPS**: Required for PWA features
- ✅ **Performance**: Edge caching and optimization

## 🔒 Security Features

The `vercel.json` configuration includes:

- Security headers (XSS protection, content type sniffing)
- Service worker caching policies
- Frame protection for wallet security

## 🌐 Custom Domain (Optional)

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain (e.g., `flightdeck.avn.network`)
3. Follow DNS configuration instructions
4. SSL certificate is automatically provisioned

## 📱 PWA Features on Vercel

- **Manifest**: Automatically served at `/manifest.json`
- **Service Worker**: Cached and updated properly
- **Install Prompt**: Works on supported browsers
- **Offline Mode**: Full wallet functionality offline
- **Push Notifications**: Ready for future implementation

## 🔍 Build Verification

```bash
# Local build test (same as Vercel)
pnpm run build
pnpm run start

# Check PWA features
# Visit: chrome://flags/#bypass-app-banner-engagement-checks
# Enable and test "Add to Home Screen"
```

## 🚨 Production Considerations

### Remove Development Features

Before production deployment:

1. **Security Review**:
   - Verify all ElectrumX connections use WSS (secure WebSocket)
   - Test offline functionality
   - Verify PWA install flow

### Performance Optimization

- Static assets are automatically optimized by Vercel
- Images are served via Vercel Image Optimization
- Service worker caches resources efficiently

## 📊 Monitoring

Vercel provides:

- **Analytics**: Page views, performance metrics
- **Function Logs**: Runtime errors
- **Real-time Logs**: Build and execution issues

## 🆘 Troubleshooting

### Common Issues:

1. **PWA not installing**:
   - Ensure HTTPS (automatic on Vercel)
   - Check manifest.json accessibility
   - Verify service worker registration

2. **Build failures**:
   - Check Node.js version (18+ required)
   - Verify all dependencies in package.json
   - Review build logs in Vercel dashboard

3. **Storage issues**:
   - IndexedDB works in all modern browsers
   - Private/incognito mode may limit storage
   - Check browser developer tools for errors

## 📞 Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js PWA**: [github.com/shadowwalker/next-pwa](https://github.com/shadowwalker/next-pwa)
- **Avian Network**: [avn.network](https://avn.network)
