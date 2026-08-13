# Frequently Asked Questions (FAQ)

## General Wallet Questions

### What is Avian FlightDeck Wallet?

Avian FlightDeck Wallet is a progressive web application (PWA) that provides a secure, privacy-focused wallet for the Avian blockchain. It runs entirely in your browser with no server dependencies for core wallet functions.

### Is my wallet data secure?

Yes! Your private keys and sensitive data are encrypted with AES-256-GCM, using a key derived from your password by Argon2id (a memory-hard key-derivation function), and stored locally on your device. The wallet uses industry-standard cryptographic practices and never transmits your private keys to any server.

### Can I use this wallet on mobile devices?

Absolutely! Avian FlightDeck Wallet is designed as a mobile-first PWA that works seamlessly across desktop, tablet, and mobile devices. You can even install it as an app on your phone.

## Message Utilities

### What are Message Utilities?

Message Utilities provide cryptographic tools for message signing, verification, encryption, and decryption. These tools allow you to prove ownership of addresses and communicate securely with other Avian users.

### How do I sign a message?

1. Navigate to the Message Utilities section
2. Select the "Sign" tab
3. Enter your wallet address and the message you want to sign
4. Click "Sign Message" and enter your password if prompted
5. Copy the generated signature to share with others

**Use case**: Proving you own a specific Avian address without revealing your private key.

### How do I verify a signed message?

1. Go to the "Verify" tab in Message Utilities
2. Enter the signer's Avian address
3. Paste the original message (must be exact)
4. Paste the signature
5. Click "Verify Signature"

**Bonus**: When verification succeeds, the public key is automatically extracted and can be used for encryption!

### How does message encryption work?

Message encryption uses ECDH (Elliptic Curve Diffie-Hellman) to create a shared secret between you and the recipient:

1. **To encrypt**: Go to "Encrypt" tab, enter the recipient's public key and your message
2. **To decrypt**: Go to "Decrypt" tab, paste the encrypted message and enter your address

**Important**: You need the recipient's public key to encrypt messages for them. The easiest way to get this is by verifying one of their signed messages first.

### Can I use public keys from verified signatures for encryption?

Yes! This is one of the most powerful features:

1. When you verify someone's signature, their public key is automatically extracted
2. Switch to the "Encrypt" tab and you'll see buttons for all extracted public keys
3. Click any address button to automatically use that public key for encryption

This creates a seamless workflow: verify → extract public key → encrypt messages.

### Are my encrypted messages compatible with other wallets?

The message signing/verification is compatible with Avian Core wallet and other standard Bitcoin-based wallets. However, the encryption format is specific to this wallet implementation.

### What's the difference between signing and encrypting?

- **Signing**: Proves you own an address (authentication)
- **Encrypting**: Hides message content so only the recipient can read it (confidentiality)

You can combine both: sign a message to prove authenticity, then encrypt it for privacy.

## Wallet Management

### Can I have multiple wallets?

Yes! Avian FlightDeck Wallet supports multiple wallets. You can:

- Create new wallets
- Import existing wallets from mnemonic or private key
- Switch between wallets easily
- Manage each wallet independently
- **Edit wallet names**: Click the edit icon next to any wallet name to rename it

### How do I rename a wallet?

1. Go to Wallet Settings → My Wallets
2. Hover over any wallet name to see the edit icon (pencil)
3. Click the edit icon to enable inline editing
4. Type the new name and press Enter (or click the checkmark)
5. Press Escape to cancel editing
6. The new name will appear immediately in both the wallet list and sidebar

### Can I view detailed transaction information?

Yes! The wallet provides comprehensive UTXO (Unspent Transaction Output) management:

1. **UTXO Overview**: View all your unspent transaction outputs in a paginated table
2. **Sortable Columns**: Sort by transaction ID, amount, confirmations, or status
3. **Search & Filter**: Find specific transactions using the search bar
4. **Pagination**: Navigate through large numbers of UTXOs efficiently
5. **Detailed Information**: See transaction IDs, addresses, amounts, and confirmation status
6. **Dust Detection**: Automatically identifies and highlights dust UTXOs

### What are UTXOs and why should I care?

UTXOs (Unspent Transaction Outputs) are the "coins" in your wallet. Understanding them helps with:

- **Fee Optimization**: Larger UTXOs mean lower transaction fees
- **Privacy**: Knowing which addresses have been used
- **Transaction Planning**: Understanding your spendable amounts
- **Dust Management**: Identifying small amounts that cost more to spend than they're worth
- Switch between wallets easily
- Manage each wallet independently

### How do I backup my wallet?

You can backup your wallet in several ways:

- **Mnemonic phrase**: 12 or 24 words that can restore your entire wallet
- **BIP39 passphrase**: Export the optional 25th word if your wallet uses one
- **Private key**: Direct export of your private key (encrypted)
- **QR codes**: Visual backup format for easy scanning

Always store backups securely and never share them with anyone.

**Important**: If your wallet uses a BIP39 passphrase (25th word), you need BOTH the mnemonic phrase AND the passphrase to restore your wallet. You can export the passphrase separately in the wallet settings under "Export Recovery Phrase".

### What if I forget my password?

Your password encrypts your private keys locally. If you forget it:

- You'll need your backup mnemonic phrase to restore the wallet
- Import your mnemonic as a new wallet with a new password
- Your funds and addresses will be restored, but you'll need to set up preferences again

### Can I import wallets from other applications?

Yes! You can import wallets using:

- **BIP39 mnemonic phrases** (12 or 24 words)
- **WIF private keys** from other Avian wallets
- **Legacy Ravencoin wallets** (with coin type 175 compatibility)

## Address Book & Contacts

### How do I manage contacts?

The Address Book feature allows you to:

- Save frequently used addresses with custom names
- Organize contacts by categories (Personal, Business, Exchange, etc.)
- Add custom avatars or use generated identicons
- Scan QR codes to add addresses quickly
- Generate QR codes for your own addresses

### Can I categorize my contacts?

Yes! You can assign categories to contacts:

- **Personal**: Friends and family
- **Business**: Work-related addresses
- **Exchange**: Trading platform addresses
- **DeFi**: Decentralized finance protocols
- **Custom**: Create your own categories

### How do QR codes work?

- **Scanning**: Use the QR scanner to quickly add addresses from other wallets
- **Generating**: Create QR codes for your addresses to share with others
- **Integration**: QR codes work seamlessly with the address book and send forms

## Transactions

### How do I send AVN?

1. Go to the Send section
2. Enter or select the recipient address (use Address Book for saved contacts)
3. Enter the amount to send
4. Choose your fee rate and UTXO selection strategy
5. For HD wallets, optionally select a specific change address
6. Use "Subtract fee from amount" to deduct fees from the send amount rather than adding them
7. Review and confirm the transaction

### What is "Subtract fee from amount"?

This feature allows you to send an exact amount by deducting the transaction fee from the send amount rather than adding it on top:

- **Standard behavior**: Sending 1.0 AVN with 0.001 fee = 1.001 total deducted from wallet
- **Subtract fee**: Sending 1.0 AVN with 0.001 fee = 1.0 total deducted, recipient gets 0.999 AVN
- **Use case**: When you want to send all available funds or need exact wallet deduction amounts

### What are UTXOs and coin selection strategies?

UTXOs (Unspent Transaction Outputs) are like digital coins in your wallet. You can choose how to select them:

- **Best Fit**: Minimizes change and transaction size
- **Largest First**: Uses biggest UTXOs first
- **Smallest First**: Useful for consolidating small amounts
- **Random**: Enhances privacy by unpredictable selection
- **Dust Consolidation**: Special mode for cleaning up small UTXOs (automatically uses single change address)

For HD wallets, you can also:

- **Select change addresses**: Choose which change address receives transaction change
- **Configure address count**: Set how many change addresses are available for selection
- **Privacy optimization**: Use different change addresses to improve transaction privacy

### How do I track transaction history?

Your transaction history is automatically synced and includes:

- Send and receive transactions
- Confirmation status and block height
- Transaction details and amounts
- Links to block explorer for verification

## Privacy & Security

### How does the wallet protect my privacy?

- **Local storage**: All data stays on your device
- **No tracking**: No analytics or user tracking
- **Optional notifications**: You control what notifications you receive
- **Client-side processing**: All cryptographic operations happen locally

### What security features are available?

- **Argon2id + AES-256-GCM encryption**: Memory-hard key derivation with authenticated encryption
- **Biometric authentication**: Use fingerprint/face unlock where supported
- **Auto-lock and a durable manual lock**: Wallet locks after inactivity, and the manual lock survives a refresh
- **Multi-wallet lock screen**: Pick which wallet to unlock, so forgetting one password never locks you out of the others
- **Security alerts**: Notifications for important security events

### Should I enable notifications?

Notifications are optional but recommended for:

- **Transaction confirmations**: Know when payments are received
- **Security alerts**: Important security events
- **Balance updates**: Stay informed about wallet activity

All notifications work locally - no external services are used.

## Troubleshooting

### The wallet won't connect to the network

1. Check your internet connection
2. Try refreshing the page
3. The wallet will automatically retry connecting to Electrum servers
4. If problems persist, try using a different network or browser

### I'm getting "Non-base58 character" errors

This usually means:

- You're using an invalid private key format
- The private key is corrupted
- You're mixing up different wallet formats

Try re-importing your wallet with the correct mnemonic or private key.

### My transaction is stuck or unconfirmed

- **Low fee**: Your transaction fee might be too low for current network conditions
- **Network congestion**: Wait for network activity to decrease
- **Double-check**: Verify the transaction exists on a block explorer

### The app is running slowly

- **Clear browser cache**: Old cached data might be causing issues
- **Close other tabs**: Free up browser memory
- **Update browser**: Ensure you're using a recent browser version
- **Device memory**: Close other applications if on mobile

## Advanced Features

### What is HD wallet derivation?

HD (Hierarchical Deterministic) wallets can generate multiple addresses from a single seed:

- **BIP44 paths**: Standard derivation paths for address generation
- **Coin types**: Support for both Avian (921) and legacy Ravencoin (175) paths
- **Address discovery**: Automatically find addresses with balances
- **Change address selection**: Choose which change address to use when sending transactions (HD wallets only)
- **Configurable address count**: Set how many change addresses to generate (1-20) in wallet settings
- **Privacy enhancement**: Use different change addresses for better transaction privacy

### How do I configure HD wallet settings?

For HD wallets, you can customize several settings:

- **Change address count**: Configure how many change addresses to generate (1-20)
- **Coin type**: Choose between Avian (921) or legacy Ravencoin (175) compatibility
- **Address selection**: Manually select change addresses when sending transactions
- **Dust consolidation**: Special mode that uses a single change address for small UTXO cleanup

These settings affect both the Derived Addresses panel and transaction creation.

### Can I use hardware wallets?

Currently, Avian FlightDeck Wallet operates as a software wallet. Hardware wallet integration may be added in future versions.

### How do I export transaction history?

You can view your complete transaction history within the wallet. For external analysis, you can:

- Copy transaction IDs to look up on block explorers
- Use the wallet's built-in transaction details
- Export individual transaction information as needed

## Getting Help

### Where can I report bugs or request features?

- **GitHub Issues**: Report bugs and request features on the project repository
- **Community Forums**: Join Avian community discussions
- **Documentation**: Check this FAQ and other docs for common solutions

### Is there a community for support?

Yes! The Avian community is active and helpful:

- **Discord/Telegram**: Real-time community support
- **Forums**: Detailed technical discussions
- **GitHub**: Development-related questions and contributions

### How can I contribute to the project?

Contributions are welcome:

- **Bug reports**: Help identify and fix issues
- **Feature requests**: Suggest improvements
- **Documentation**: Help improve guides and FAQs
- **Code contributions**: Submit pull requests for features or fixes

---

_This FAQ covers the most common questions about Avian FlightDeck Wallet. For technical documentation, see the other docs in this folder. For the latest updates and changes, check [RECENT_UPDATES.md](RECENT_UPDATES.md)._
