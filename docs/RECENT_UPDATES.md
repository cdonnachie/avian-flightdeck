# Recent Updates and Improvements

This document tracks recent enhancements to the Avian FlightDeck Wallet application.

## Flight-deck refresh (2026)

### Brand & UI/UX

- **Instrument-panel design language**: A committed "flight deck" look — night ground, mint→cyan
  gradients, Roboto Mono readouts, and an artificial-horizon motif — carried across the app.
- **New-visitor landing page** at `/` (shown only when no wallet exists), with an animated
  primary-flight-display that levels its horizon once on load (respecting reduced-motion).
- **Guided onboarding wizard** for creating a wallet, unified with Wallet Management's create flow
  behind one headless hook (`useCreateWalletWizard`) and two theme-aware skins.
- **Dashboard balance count-up** animation and fuller layout; refreshed lock/auth, Avian Connect,
  settings, and backup/security surfaces.

### Security

- **Argon2id key derivation** (via `hash-wasm`, run in WebAssembly) replaces scrypt for
  password-based encryption, paired with **AES-256-GCM**. The ciphertext format is versioned and
  self-describing, so older scrypt and CryptoJS blobs still decrypt and are transparently
  re-encrypted to the current format on the next successful unlock. Parameters are tuned so an
  unlock takes a few hundred milliseconds.
- **Multi-wallet lock screen**: an unlock picker so forgetting one wallet's password never locks you
  out of the others; biometric unlock is scoped to its own wallet.
- **Durable manual lock**: the Lock action now survives a page refresh even with the open-time wall
  off.
- **Terms acceptance** moved to wallet creation; the public landing page is the entry point.

### Testing & tooling

- E2E coverage expanded beyond Avian Connect to the landing page, onboarding, the lock screen,
  balance, and empty states.
- E2E builds use cheap Argon2id parameters (`pnpm build:e2e` / `pnpm test:e2e`) so browser unlocks
  stay fast and deterministic; production builds keep the hardened defaults.

## Latest Features (July 2025)

### Enhanced User Experience

- **Wallet Name Editing**: Users can now edit wallet names directly in the wallet manager
  - Inline editing with hover-to-reveal edit button
  - Real-time updates across all components (sidebar, wallet list)
  - Event-driven synchronization between components
  - Keyboard shortcuts (Enter to save, Escape to cancel)

- **Password Visibility Toggles**: Added eye icons to all password fields throughout the application
  - Comprehensive implementation across backup, import, creation, and authentication forms
  - Consistent UX pattern that maintains visibility state during form interaction
  - Follows industry best practices for password field usability

- **Advanced UTXO Management**: Upgraded UTXO overview with professional data table features
  - @tanstack/react-table integration for powerful table functionality
  - Sortable columns with visual sort indicators
  - Pagination with configurable page sizes (10, 20, 30, 40, 50 rows)
  - Search and filtering capabilities
  - Mobile-responsive design with drawer interface
  - Performance optimized for handling large numbers of UTXOs

## Advanced Wallet Features

### BIP39 Enhanced Security

- **24-Word Mnemonic Support**: Added option to create wallets with 24-word recovery phrases for enhanced security
- **BIP39 Passphrase (25th Word)**: Optional passphrase support for additional security layer
- **Legacy Coin Type Compatibility**: Support for importing wallets created with BIP44 coin type 175 (Ravencoin legacy)
- **Smart Detection**: Utility methods to detect and recommend correct coin type for wallet imports
- **Security Warnings**: Clear compatibility warnings and user education for advanced features

### Mnemonic Management Improvements

- **Dynamic Word Count Detection**: UI adapts to show both 12 and 24-word recovery phrases
- **Enhanced Import Validation**: Support for importing both 12 and 24-word recovery phrases
- **Secure Passphrase Viewing**: Separate authentication required to view stored BIP39 passphrases
- **BIP39 Passphrase Export**: Restored ability to export BIP39 passphrase (25th word) from wallet settings
- **Compatibility Alerts**: Clear warnings when using features that may not be compatible with other wallets
- **Improved Export UI**: Better user experience with "Clear" buttons instead of confusing "Export New" labels

### HD Wallet Configuration

- **Slider Control**: Added intuitive slider for configuring number of HD wallet addresses to display
- **Wallet-Specific Settings**: Address count preferences are now stored per wallet
- **Visual Indicators**: Current wallet address display in HD configuration section
- **Automatic Reset**: Settings properly reset when switching between wallets
- **Consistent UI**: HD config slider matches the design and functionality of Derived Addresses panel

## Wallet Management Improvements

### Multi-Wallet Support Enhancements

- **Wallet Switching Bug Fixes**: Fixed issues where HD configuration and sensitive data persisted when switching wallets
- **Proper State Reset**: Exported mnemonic, private key, and BIP39 passphrase data automatically clears when changing wallets
- **Current Wallet Indicators**: Visual indicators show which wallet is currently active in settings
- **Wallet-Specific Storage**: Address count preferences and other settings properly isolated per wallet

### User Experience Improvements

- **Intuitive Button Labels**: Changed confusing "Export New" buttons to clear "Clear" labels throughout the interface
- **Better Visual Feedback**: Improved notifications and user feedback for wallet operations
- **Consistent Design**: Applied design system tokens and shadcn components across all wallet settings
- **Address Book Integration**: Improved wallet address saving with optional descriptions instead of hardcoded text

## User Interface Improvements

### Responsive Design System

- **Complete Mobile-First Redesign**: All components now use a consistent responsive pattern
- **Drawer/Dialog Architecture**: Mobile uses full-screen drawers, desktop uses centered dialogs
- **640px Breakpoint**: Standardized breakpoint across all responsive components
- **Touch Optimization**: Enhanced mobile interactions with appropriate touch targets

### Enhanced Components

- **AuthenticationDialog**: Now responsive with mobile drawer and desktop dialog
- **BackupQRModal**: Added backup type selection (Full/Wallets Only) with responsive design
- **DerivedAddressesPanel**: Mobile-optimized tabs and search functionality
- **WalletSettingsDashboard**: All settings panels now use responsive modal/drawer pattern
- **NotificationSettings**: Converted to use shadcn Card components with consistent design system styling
- **HD Wallet Configuration**: New slider-based interface for address count configuration
- **LogViewer**: Enhanced with debug status indicators and responsive interface

## Developer Tools and Debugging

### LogViewer Enhancements

- **Debug Status Indicators**: Visual badges show which loggers have debug mode enabled
- **Enhanced Dropdown**: Logger selection dropdown clearly identifies debug-enabled loggers
- **Security Audit Integration**: Read-only access to security audit logs within unified log viewer
- **Improved UX**: Clear indicators for read-only logs and debug status

### Error Handling

- **Error Boundary System**: Comprehensive error handling with detailed reporting
- **Client Error Boundaries**: Specialized error boundaries for React component errors
- **Error Integration**: Error reports now integrated into log viewer system

## Backup and Restore Features

### Backup Type Selection

- **Full Backup**: Complete wallet data, address book, and settings
- **Wallets Only**: Lightweight backup containing just wallet keys and addresses
- **Smart Defaults**: Appropriate backup type selection based on user needs
- **Clear Indicators**: Visual distinction between backup types in UI

### QR Code Backup Improvements

- **Responsive QR Display**: Optimized QR code sizing for mobile and desktop
- **Enhanced Scanning**: Improved camera integration for QR code scanning
- **Better Error Handling**: Clearer error messages and recovery options

## Security Enhancements

### Audit Log Integration

- **Unified View**: Security audit logs accessible through main log viewer
- **Read-Only Protection**: Security audit logs clearly marked as read-only
- **Access Control**: Clearing restrictions properly enforced for security logs
- **Clear UX**: Users understand limitations and proper management location

### Authentication Improvements

- **Responsive Authentication**: Biometric and password authentication optimized for mobile
- **Better Error Handling**: Clearer authentication error messages and recovery
- **Improved Flow**: Streamlined authentication process across device types

## Technical Improvements

### Code Organization

- **Consistent Patterns**: Standardized responsive component patterns across codebase
- **Shared Components**: Reusable content components that work in both mobile and desktop contexts
- **Better Separation**: Clear separation of mobile and desktop UI concerns
- **Type Safety**: Enhanced TypeScript types for responsive components

### Performance Optimizations

- **Conditional Rendering**: Efficient rendering with proper component mounting/unmounting
- **Optimized Bundle**: Better code splitting for mobile vs desktop features
- **Reduced Overhead**: Minimal layout shifts during responsive transitions

## Documentation Updates

### New Documentation

- **Responsive Design Guide**: Comprehensive documentation of responsive patterns
- **Enhanced README**: Updated feature descriptions and implementation details
- **Security Features**: Updated security documentation with new features

### Improved Existing Docs

- **Feature Accuracy**: All documented features now match implementation
- **Current Examples**: Code examples updated to reflect current patterns
- **Clear Organization**: Better structure for finding relevant information

## Quality Assurance

### Testing Improvements

- **Responsive Testing**: All components tested across mobile and desktop breakpoints
- **Error Scenarios**: Comprehensive testing of error handling and recovery
- **User Experience**: Real-world testing of touch interactions and mobile usability

### Code Quality

- **Consistent Patterns**: Standardized implementation patterns across components
- **Better Error Handling**: Improved error handling and user feedback
- **Type Safety**: Enhanced TypeScript usage for better development experience

## User Experience Enhancements

### Mobile Experience

- **Touch-First Design**: All mobile interfaces optimized for touch interaction
- **Full-Screen Modals**: Mobile uses space-efficient full-screen interfaces
- **Gesture Support**: Proper gesture handling for drawer interactions
- **Optimized Navigation**: Simplified navigation patterns for mobile users

### Desktop Experience

- **Centered Modals**: Desktop maintains traditional modal dialog patterns
- **Enhanced Functionality**: Desktop interfaces provide full feature access
- **Better Information Density**: Desktop layouts efficiently use available screen space
- **Consistent Interactions**: Familiar desktop interaction patterns maintained

## Future Roadmap Alignment

These improvements establish a strong foundation for future enhancements:

- **Multi-language support**: Responsive system ready for localization
- **Advanced features**: Architecture supports complex new features
- **Accessibility**: Responsive patterns enhance accessibility across devices
- **Performance**: Optimized patterns support application scaling
