# Avian FlightDeck Wallet

A Progressive Web App (PWA) implementation of the Avian cryptocurrency wallet, built with Next.js and TypeScript. This project represents a modern migration from the original browser extension to a cross-platform web application.

## Features

- 🔐 **Secure Wallet Management**: Generate, import, and manage Avian wallets with HD (Hierarchical Deterministic) support
- 🗂️ **HD Wallet Support**: BIP44-compliant address derivation with receiving and change addresses
- 🎯 **Manual UTXO Selection**: Advanced transaction control with UTXO selection from multiple HD addresses
- 🔄 **Change Address Management**: Configurable change address selection for enhanced privacy
- ⚙️ **HD Configuration**: Intuitive slider controls for managing HD wallet address generation
- 🔒 **Encryption Support**: Optional password-based wallet encryption with BIP39 passphrase support
- 🔐 **Biometric Authentication**: Face ID, Touch ID, and Windows Hello support
- 💸 **Send Transactions**: Send AVN to any valid Avian address with fee customization options
- 📱 **Receive Payments**: QR code generation for easy payment requests
- 📊 **Balance Tracking**: Real-time balance updates across all derived addresses
- 💰 **UTXO Management**: Comprehensive UTXO overview and selection tools
- 💾 **Comprehensive Backup**: Full wallet backup with security settings and selective backup types (Full/Wallets Only)
- 🌐 **Progressive Web App**: Installable, offline-capable application with responsive mobile-first design
- 🎨 **Modern UI**: Clean, responsive design with dark mode support and mobile-optimized interface
- 🔧 **Wallet Settings**: Comprehensive wallet management tools with responsive modal/drawer interfaces
- 🔔 **Notifications**: Privacy-focused push notifications for transactions and security events
- 🐛 **Debug Tools**: In-app log viewer with debug status indicators and security audit integration
- ❓ **User Help**: Built-in About section with feature overview and comprehensive FAQ

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **PWA**: next-pwa for service worker and manifest
- **Cryptocurrency**: bitcoinjs-lib for wallet operations
- **QR Codes**: qrcode library for address display
- **Icons**: Lucide React icons
- **Encryption**: CryptoJS for wallet security
- **Authentication**: WebAuthn/FIDO2 for biometric authentication
- **Storage**: IndexedDB for persistent data storage
- **Security**: Client-side encryption for sensitive data protection

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/cdonnachie/avian-flightdeck.git
cd avian-flightdeck
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables (optional):

```bash
cp .env.example .env.local
```

Edit `.env.local` if you need to customize any settings.

4. Run the development server:

```bash
pnpm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
pnpm run build
pnpm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main wallet interface
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── SendForm.tsx       # Transaction sending form with HD support
│   ├── ReceiveModal.tsx   # Address/QR code modal
│   ├── WalletSettings.tsx # Wallet management settings
│   ├── DerivedAddressesPanel.tsx # HD wallet address explorer
│   ├── UTXOOverview.tsx   # UTXO management interface
│   ├── UTXOSelector.tsx   # Manual UTXO selection
│   └── AddressBook.tsx    # Contact management
├── contexts/              # React contexts
│   └── WalletContext.tsx  # Global wallet state with HD support
├── services/              # Business logic
│   ├── WalletService.ts   # Core wallet operations with HD derivation
│   ├── StorageService.ts  # Browser storage abstraction
│   ├── ElectrumService.ts # Blockchain communication
│   ├── SecurityService.ts # Authentication and security
│   └── BackupService.ts   # Wallet backup and restore
└── types/                 # TypeScript type definitions
```

## Key Features

### HD Wallet Support

- **BIP44 Compliance**: Full implementation of BIP44 derivation paths (m/44'/921'/0'/change/index)
- **Multi-Coin Support**: Support for both Avian (921) and Ravencoin (175) coin types for legacy compatibility
- **Address Management**: Automatic generation and tracking of receiving and change addresses
- **Visual Address Explorer**: Comprehensive interface showing all derived addresses with balances and transaction history
- **Address Authentication**: Secure access to HD addresses with biometric or password authentication
- **Configurable Derivation**: Adjustable number of addresses to generate (1-20 per type)

### Advanced Transaction Features

- **Manual UTXO Selection**: Select specific UTXOs from any HD address for transactions
- **Change Address Selection**: Choose custom change addresses from your HD wallet
- **Subtract Fee Options**: Option to subtract transaction fees from the sent amount
- **Multi-Address Transactions**: Send from multiple HD addresses in a single transaction
- **UTXO Overview**: Detailed view of all unspent outputs across your wallet
- **Balance Aggregation**: Real-time balance calculation across all derived addresses

### Responsive Design System

- **Mobile-First Architecture**: All components adapt seamlessly between mobile and desktop interfaces
- **Drawer/Dialog Pattern**: Mobile uses full-screen drawers, desktop uses centered dialogs
- **Breakpoint Consistency**: 640px breakpoint used across all responsive components
- **Touch-Optimized**: Mobile interfaces optimized for touch interaction and smaller screens

### Wallet Management

- Generate new HD wallets with BIP44 compliance and optional encryption
- Import existing wallets via private key or mnemonic seed phrase
- Export private keys (with password protection)
- Encrypt/decrypt existing wallets
- HD address derivation with configurable coin types (Avian 921, Ravencoin 175)
- Change address preference management with persistent storage
- Multi-address balance tracking and transaction history

### Transaction Handling

- Send AVN with automatic fee calculation and manual fee options
- Advanced UTXO selection from any HD address
- Change address selection for enhanced privacy
- Subtract fee from amount option
- Address validation with HD wallet support
- Balance checking across all derived addresses
- Multi-address transaction construction
- Transaction confirmation and comprehensive error handling
- Support for transactions from multiple HD addresses simultaneously

### Security

- Client-side private key storage
- Optional AES encryption with user passwords
- Biometric authentication (Face ID, Touch ID, Windows Hello)
- Per-wallet biometric security configuration
- Security audit logging for sensitive operations
- Secure key generation using bitcoinjs-lib
- No private keys transmitted over network
- Comprehensive backup and restore with security settings

### PWA Features

- Installable on mobile and desktop
- Offline functionality for wallet operations
- Background sync capabilities
- Native app-like experience

### Biometric Authentication

- Hardware-backed biometric security (WebAuthn/FIDO2)
- Support for Face ID, Touch ID, Windows Hello, and Android biometrics
- Per-wallet biometric configuration
- Optional biometric requirements for transactions and exports
- Device-specific implementation (biometrics require re-setup after restore on a new device)
- Global and per-wallet security settings

### Backup and Restore

- Comprehensive wallet backup including:
  - Multiple wallet configurations
  - Address book entries
  - Security settings and preferences
  - Transaction history
  - Security audit log
- Multiple backup types:
  - **Full Backup**: Complete wallet data, address book, and settings
  - **Wallets Only**: Just wallet keys and addresses for lighter backups
- Optional backup encryption with AES
- Backup validation and integrity checking
- Selective restore options (wallets, address book, settings, etc.)
- Portable backups for cross-device migration
- Biometric status tracking for wallets after restore
- QR code backup/restore for air-gapped transfers

### Debug and Development Tools

- **Integrated Log Viewer**: Comprehensive logging system with multiple logger support
- **Debug Status Indicators**: Visual indicators showing which loggers have debug mode enabled
- **Security Audit Integration**: Read-only access to security audit logs within the log viewer
- **Error Boundary System**: Comprehensive error handling with detailed error reporting
- **Real-time Log Monitoring**: Auto-refresh capabilities and live log filtering
- **Log Export**: Download logs as JSON for external analysis

### User Help and Support

- **In-App About Section**: Comprehensive feature overview with detailed descriptions
- **Interactive FAQ**: Common questions and answers about wallet functionality
- **Quick Help Access**: Help button available in main interface for instant assistance
- **Feature Highlights**: Visual indicators and explanations of key wallet capabilities
- **Troubleshooting Guide**: Step-by-step solutions for common issues

## Configuration

### ElectrumX Server

The app connects to Avian ElectrumX servers for blockchain interaction. Currently configured for:

- Server: `electrum-us.avn.network:50003`
- Protocol: WebSocket Secure (WSS)

### PWA Settings

PWA configuration is handled in:

- `next.config.js` - Next.js PWA setup
- `public/manifest.json` - Web app manifest

## Development

### Adding New Features

1. Create service functions in appropriate service files
2. Add React components in the `components/` directory
3. Update the WalletContext if state changes are needed
4. Add proper TypeScript types

### Testing

- Test wallet operations with small amounts
- Verify PWA installation on different devices
- Test offline functionality
- Validate transaction signing and broadcasting

### Security Notes

- Never store unencrypted private keys
- Always validate user inputs
- Use HTTPS in production
- Implement proper error handling for crypto operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Security

This wallet is designed for small amounts and testing purposes. For large amounts:

- Verify all transactions carefully
- Keep backups of your private keys
- Use strong passwords for encryption
- Enable biometric authentication where available

### Biometric Security Notes

- Biometric credentials are device-specific and cannot be transferred between devices
- After restoring a backup on a new device, biometrics must be set up again
- Biometrics provide an additional security layer, but are not a replacement for strong passwords
- The app maintains information about which wallets had biometrics enabled to guide re-setup

## Documentation

See our [Documentation Index](docs/index.md) for comprehensive guides.

### Key Documentation

- [Getting Started](docs/GETTING_STARTED.md): Quick start guide for developers
- [Security Features](docs/SECURITY_FEATURES.md): Overview of security features
- [Privacy](docs/PRIVACY.md): Comprehensive privacy approach
- [Notifications](docs/NOTIFICATIONS.md): Notification system documentation
- [Deployment](docs/DEPLOY.md): Guide to deploy on Vercel

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:

- GitHub Issues: [Repository Issues](https://github.com/cdonnachie/avian-flightdeck/issues)
- Community: Avian Network Discord/Telegram

## Roadmap

- [ ] Multi-language support
- [x] Advanced fee estimation with manual options
- [x] HD wallet support with BIP44 compliance
- [x] Manual UTXO selection and management
- [x] Change address selection and management
- [x] Multi-address transaction support
- [x] Backup/restore via QR codes
- [x] In-app log viewer for debugging with debug status indicators
- [x] Security audit log integration with read-only access
- [x] Address book integration with HD wallets
