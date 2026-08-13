# Avian FlightDeck Wallet

## 🚀 Getting Started

- ✅ Next.js 15 with App Router
- ✅ TypeScript configuration
- ✅ Tailwind CSS styling
- ✅ PWA capabilities (next-pwa)
- ✅ Wallet services and components
- ✅ Cryptocurrency libraries (bitcoinjs-lib; Argon2id via hash-wasm; crypto-js for reading legacy blobs)
- ✅ QR code generation
- ✅ React Context for state management

## 🏃‍♂️ Running the Application

1. **Development Server:**

   ```bash
   pnpm run dev
   ```

   Then open [http://localhost:3000](http://localhost:3000)

2. **Production Build:**
   ```bash
   pnpm run build
   pnpm start
   ```

## 🔧 Key Features Implemented

### Core Wallet Functionality

- **WalletService**: Handles wallet generation, restoration, and transactions
- **StorageService**: Manages browser storage with encryption support
- **ElectrumService**: Blockchain communication (with mock data for development)

### UI Components

- **SendForm**: Transaction sending interface
- **ReceiveModal**: Address display with QR codes
- **WalletSettings**: Wallet management and security options

### Security Features

- Private key encryption with user passwords
- Secure local storage
- Input validation
- Error handling

## 🔒 Security Notes

- **Private Keys**: Stored locally with optional encryption
- **Testing**: Use small amounts for testing

## 📚 Development

- Source code in `src/` directory
- Components in `src/components/`
- Services in `src/services/`
- Global state in `src/contexts/`

## 🎯 Launch Instructions

Ready to launch your Avian FlightDeck Wallet! Run:

```bash
pnpm run dev
```

The wallet will be available at `http://localhost:3000` with all features ready for testing.

---
