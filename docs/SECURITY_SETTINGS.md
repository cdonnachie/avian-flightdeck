# Security Settings for Avian FlightDeck Wallet

This document covers important security configuration settings for the Avian FlightDeck Wallet application.

## Security Implementation

The Avian FlightDeck Wallet implements a client-side security model that doesn't rely on server-side environment variables for encryption. Instead, it uses:

1. **User-provided passwords** for encryption of sensitive data
2. **Argon2id key derivation** (a memory-hard KDF, run in WebAssembly) with strong parameters for password-based encryption, tuned so an unlock takes a few hundred milliseconds. Data written by earlier scrypt and CryptoJS builds is still read and is transparently re-encrypted to the current format on the next successful unlock.
3. **AES-256-GCM encryption** for secure storage of private keys and mnemonics

## Local Storage Security

The Avian FlightDeck Wallet uses client-side storage mechanisms with several security features to protect user data:

### IndexedDB Security

1. **Encrypted Storage**: Sensitive wallet data is encrypted before storage
2. **Storage Partitioning**: Browser security isolates data between different sites
3. **No Cross-Origin Access**: Other websites cannot access the wallet's storage

### Key Security Features

- **Password-based Encryption**: User passwords encrypt private keys before storage
- **Memory-only Private Keys**: Decrypted keys only exist in memory during transactions
- **Auto-lock Security**: Wallet locks after configurable periods of inactivity
- **Clear Memory**: Sensitive data is cleared from memory when wallet is locked

## Security Best Practices

When using the application:

1. **Strong Passwords**: Use unique, strong passwords for wallet encryption
2. **Regular Backups**: Back up wallet data securely and regularly
3. **Private Browsing Limitations**: Note that private/incognito modes have limited storage
4. **Device Security**: Keep your device secure with up-to-date software
