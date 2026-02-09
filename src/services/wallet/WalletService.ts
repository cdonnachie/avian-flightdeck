/**
 * WalletService.ts
 *
 * Avian cryptocurrency wallet service using bitcoinjs-lib with Avian network parameters.
 *
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import { ElectrumService } from '../core/ElectrumService';
import { StorageService } from '../core/StorageService';
import { walletLogger } from '@/lib/Logger';
import {
    UTXOSelectionService,
    EnhancedUTXO,
    CoinSelectionStrategy,
    UTXOSelectionOptions,
} from './UTXOSelectionService';
import * as bitcoinMessage from 'bitcoinjs-message';
import { randomBytes, createHash, createCipheriv, createDecipheriv, createHmac } from 'crypto';
import { scrypt, ProgressCallback } from 'scrypt-js';
import * as CryptoJS from 'crypto-js';

const scryptPromise = (
    password: Buffer,
    salt: Buffer,
    N: number,
    r: number,
    p: number,
    dkLen: number,
): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        try {
            walletLogger.debug('Starting scrypt key derivation with parameters:', {
                passwordLength: password.length,
                saltLength: salt.length,
                N,
                r,
                p,
                dkLen,
            });

            let hasStarted = false;
            let lastProgress = 0;

            // Based on the scrypt-js v3 documentation, the progress callback only receives one argument
            // (the progress value between 0-1) and can return true to cancel the operation
            const progressCallback = (progress: number): boolean | void => {
                // Mark that we've received at least one callback
                hasStarted = true;

                // Only log progress occasionally to avoid too many logs
                if (progress - lastProgress >= 0.1 || progress === 1) {
                    walletLogger.debug(`Scrypt progress: ${Math.round(progress * 100)}%`);
                    lastProgress = progress;
                }

                // Return false to continue (or undefined which is falsy)
                return false;
            };

            // Call scrypt with our progress callback
            scrypt(password, salt, N, r, p, dkLen, progressCallback)
                .then((key) => {
                    walletLogger.debug('Scrypt key derivation complete');
                    resolve(Buffer.from(key));
                })
                .catch((error) => {
                    walletLogger.error('Scrypt error:', error);
                    reject(error);
                });

            // Add a safety check in case the callback is never called
            setTimeout(() => {
                if (!hasStarted) {
                    walletLogger.error('Scrypt key derivation timed out - callback was never called');
                    reject(new Error('Scrypt key derivation timed out - callback was never called'));
                }
            }, 10000); // 10 second timeout
        } catch (e) {
            // Catch any synchronous errors that might occur when starting scrypt
            reject(
                new Error(`Failed to initialize scrypt: ${e instanceof Error ? e.message : String(e)}`),
            );
        }
    });
};
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// Initialize ECPair and BIP32 with secp256k1
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

const ECIES_PREFIX = Buffer.from('BIE1');

export interface WalletData {
    id?: number;
    name: string;
    address: string;
    privateKey: string;
    mnemonic?: string; // BIP39 mnemonic phrase for backup/recovery
    coinType?: 921 | 175; // BIP44 coin type for derivation (default: 921 for Avian, 175 for Ravencoin legacy)
    isEncrypted: boolean;
    isActive: boolean;
    createdAt: Date;
    lastAccessed: Date;
}

// Legacy interface for backward compatibility
export interface LegacyWalletData {
    address: string;
    privateKey: string;
    mnemonic?: string;
}

// Avian network configuration
export const avianNetwork: bitcoin.Network = {
    messagePrefix: '\x16Raven Signed Message:\n',
    bech32: '', // Avian doesn't use bech32
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4,
    },
    pubKeyHash: 0x3c, // Avian addresses start with 'R' (decimal 60)
    scriptHash: 0x7a, // Avian script addresses start with 'r' (decimal 122)
    wif: 0x80, // WIF version byte (decimal 128)
};

export async function secureEncrypt(data: string, password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const N = 16384,
        r = 8,
        p = 1,
        dkLen = 32;
    const key = await scryptPromise(Buffer.from(password, 'utf-8'), salt, N, r, p, dkLen);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
}

async function secureDecrypt(encryptedHex: string, password: string): Promise<string> {
    const encryptedData = Buffer.from(encryptedHex, 'hex');
    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const N = 16384,
        r = 8,
        p = 1,
        dkLen = 32;
    const key = await scryptPromise(Buffer.from(password, 'utf-8'), salt, N, r, p, dkLen);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

/**
 * Legacy decryption using CryptoJS for backward compatibility
 */
export function legacyDecrypt(encryptedData: string, password: string): string {
    const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, password);
    const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) {
        throw new Error('Legacy decryption failed or resulted in empty string.');
    }
    return decryptedText;
}

/**
 * Unified decryption function that handles both new (scrypt) and legacy (CryptoJS) formats.
 * @returns An object containing the decrypted data and a flag indicating if legacy format was used.
 */
export async function decryptData(
    encryptedData: string,
    password: string,
): Promise<{ decrypted: string; wasLegacy: boolean }> {
    try {
        // Attempt to decrypt using the new secure method first.
        // This will fail on non-hex legacy data, triggering the catch block.
        const decrypted = await secureDecrypt(encryptedData, password);
        return { decrypted, wasLegacy: false };
    } catch (secureError) {
        // Log more useful information about the secure decryption failure
        walletLogger.debug('Secure decryption failed, attempting legacy method', {
            error: secureError instanceof Error ? secureError.message : 'Unknown error',
            isHex: /^[0-9a-fA-F]+$/.test(encryptedData),
            dataLength: encryptedData.length,
        });

        try {
            // If secure decrypt fails, fall back to the legacy method.
            const decrypted = legacyDecrypt(encryptedData, password);
            return { decrypted, wasLegacy: true };
        } catch (legacyError) {
            // If both methods fail, the password is wrong or data is corrupt.
            walletLogger.error('Decryption failed for both secure and legacy methods.', {
                secureError: secureError instanceof Error ? secureError.message : 'Unknown error',
                legacyError: legacyError instanceof Error ? legacyError.message : 'Unknown error',
                isHex: /^[0-9a-fA-F]+$/.test(encryptedData),
                dataLength: encryptedData.length,
            });
            throw new Error('Invalid password or corrupted data');
        }
    }
}

/**
 * Recover a secp256k1 public key from a Bitcoin-message signature.
 *
 * @param message        The original UTF-8 string that was signed.
 * @param signatureB64   The Base64-encoded “compact” signature (with recovery flag byte).
 * @returns              The recovered public key (33- or 65-byte Buffer/Uint8Array).
 * @throws               If recovery fails or the signature flag is invalid.
 */
export function recoverPubKey(message: string, signatureB64: string): Uint8Array {
    // 1) Base64 → Buffer
    const sigBuf = Buffer.from(signatureB64, 'base64');

    // 2) Peel off first byte to get recovery & compression bits
    const flag = sigBuf[0] - 27;
    if (flag < 0 || flag > 15) {
        throw new Error('Invalid signature flag');
    }
    const recoveryId = flag & 0x03;
    const compressed = Boolean(flag & 0x04);

    // 3) Extract the 64-byte (r||s) signature
    const sig64 = sigBuf.subarray(1);

    // 4) Hash the message with Bitcoin’s “magic” prefix
    // Ensure we use Avian's prefix for proper message signing
    const msgHash = bitcoinMessage.magicHash(message, avianNetwork.messagePrefix);

    // 5) Recover the pubkey
    const pubkey = ecc.recover(msgHash, sig64, recoveryId as ecc.RecoveryIdType, compressed);
    if (!pubkey) {
        throw new Error('Public key recovery failed');
    }

    return pubkey;
}

export class WalletService {
    protected electrum: ElectrumService;

    constructor(electrumService?: ElectrumService) {
        this.electrum = electrumService || new ElectrumService();
    }

    async generateWallet(
        password: string,
        useMnemonic: boolean = true,
        passphrase?: string,
    ): Promise<LegacyWalletData> {
        // Validate required password
        if (!password || password.length < 8) {
            throw new Error('Password is required and must be at least 8 characters long');
        }

        try {
            let keyPair: any;
            let mnemonic: string | undefined;

            if (useMnemonic) {
                // Generate BIP39 mnemonic
                mnemonic = bip39.generateMnemonic(128); // 12 words

                // Derive seed from mnemonic with optional passphrase (BIP39 25th word)
                const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');

                // Create HD wallet root
                const root = bip32.fromSeed(seed, avianNetwork);

                // Derive key at standard path m/44'/921'/0'/0/0 (921 is Avian's coin type)
                const path = "m/44'/921'/0'/0/0";
                const child = root.derivePath(path);

                if (!child.privateKey) {
                    throw new Error('Failed to derive private key from mnemonic');
                }

                // Create ECPair from derived private key
                keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });
            } else {
                // Generate a random key pair directly (legacy method)
                keyPair = ECPair.makeRandom({ network: avianNetwork });
            }

            const privateKeyWIF = keyPair.toWIF();

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address');
            }

            // Encrypt private key with password (now mandatory)
            const finalPrivateKey = await secureEncrypt(privateKeyWIF, password);

            // Encrypt mnemonic with password (now mandatory if mnemonic exists)
            const finalMnemonic = mnemonic ? await secureEncrypt(mnemonic, password) : mnemonic;

            // Store mnemonic if generated
            if (mnemonic) {
                await StorageService.setMnemonic(finalMnemonic!);
            }

            return {
                address,
                privateKey: finalPrivateKey,
                mnemonic: finalMnemonic,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to generate wallet: ${errorMessage}`);
        }
    }

    async restoreWallet(privateKey: string, password?: string): Promise<LegacyWalletData> {
        try {
            // Decrypt private key if password provided
            const { decrypted: decryptedKey } = password
                ? await decryptData(privateKey, password)
                : { decrypted: privateKey };

            if (!decryptedKey) {
                throw new Error('Invalid password or corrupted private key');
            }

            // Create key pair from WIF using ECPair
            const keyPair = ECPair.fromWIF(decryptedKey, avianNetwork);

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to restore address');
            }

            return {
                address,
                privateKey,
            };
        } catch (error) {
            throw new Error('Failed to restore wallet');
        }
    }

    async getBalance(address: string, forceRefresh: boolean = false): Promise<number> {
        try {
            return await this.electrum.getBalance(address, forceRefresh);
        } catch (error) {
            return 0;
        }
    }

    /**
     * Subscribes to wallet updates via ElectrumX
     * @param address - The wallet address to monitor
     * @param onUpdate - Optional callback when updates occur
     */
    async subscribeToWalletUpdates(address: string, onUpdate?: (data: any) => void): Promise<void> {
        try {
            // Subscribe to address changes via ElectrumX
            await this.electrum.subscribeToAddress(address, async (status: string) => {
                // Process transaction history to detect new received transactions
                try {
                    await this.processTransactionHistory(address);
                } catch (error) {
                    walletLogger.error(
                        'Error processing transaction history during subscription update:',
                        error,
                    );
                }

                // Trigger balance update when status changes
                this.getBalance(address, true)
                    .then((newBalance) => {
                        // Store updated balance in wallet record
                        StorageService.setWalletBalance(address, newBalance);

                        // Call the callback if provided
                        if (onUpdate) {
                            onUpdate({ address, balance: newBalance, status: status });
                        }
                    })
                    .catch((error) => {
                        walletLogger.error('Error updating balance after subscription notification:', error);
                    });
            });
        } catch (error) {
            walletLogger.error('Error subscribing to wallet updates:', error);
            throw error;
        }
    }

    async unsubscribeFromWalletUpdates(address: string): Promise<void> {
        try {
            // Unsubscribe from address updates via ElectrumX
            await this.electrum.unsubscribeFromAddress(address);

            // We no longer disable wallet notifications during unsubscribe
            // This ensures notification settings are preserved when switching wallets
            walletLogger.info(
                `Unsubscribed from wallet updates for ${address} (notifications preserved)`,
            );

            // Note: Previously this would disable notifications for the wallet,
            // but that caused issues when switching wallets as it would disable
            // notifications for all wallets that were previously active
        } catch (error) {
            walletLogger.error('Error unsubscribing from wallet updates:', error);
            throw error;
        }
    }

    /**
     * Initialize wallet by connecting to Electrum, getting balance, and processing transaction history
     * @param address - The wallet address to initialize
     * @param onUpdate - Optional callback for updates from subscription
     * @param onProgress - Optional callback for transaction processing progress (passed to other methods)
     */
    async initializeWallet(
        address: string,
        onUpdate?: (data: any) => void,
        onProgress?: (processed: number, total: number, currentTx?: string) => void,
    ): Promise<void> {
        try {
            // Connect to Electrum server only if not already connected
            if (!this.electrum.isConnectedToServer()) {
                await this.electrum.connect();
            }

            // Get initial balance
            const balance = await this.getBalance(address);

            // Store balance in wallet record and global preference for compatibility
            await StorageService.setWalletBalance(address, balance);

            // Migrate transaction addresses for better multi-wallet support
            try {
                const migratedCount = await StorageService.migrateTransactionAddresses();
                if (migratedCount > 0) {
                }
            } catch (migrationError) {
                walletLogger.warn('Error during transaction address migration:', migrationError);
            }

            // Migrate balance data to wallet table (only once)
            try {
                // Check if the migration has been completed before
                const migrationCompleted = localStorage.getItem('balanceMigrationCompleted');
                if (!migrationCompleted) {
                    await StorageService.migrateBalanceData();

                    // Mark migration as completed
                    localStorage.setItem('balanceMigrationCompleted', 'true');
                }
            } catch (balanceMigrationError) {
                walletLogger.warn('Error during balance data migration:', balanceMigrationError);
            }

            // Check if there are any transactions without wallet address for this wallet
            try {
                const txHistory = await StorageService.getTransactionHistory(address);
                const missingWalletAddress = txHistory.filter((tx) => !tx.walletAddress);

                if (missingWalletAddress.length > 0) {
                    for (const tx of missingWalletAddress) {
                        tx.walletAddress = address;
                        await StorageService.saveTransaction(tx);
                    }
                }
            } catch (fixError) {
                walletLogger.warn('Error fixing transactions without wallet address:', fixError);
            }

            // Process initial transaction history only if needed
            try {
                // Check if we need to process transactions by checking if this is first login
                const lastProcessedKey = `${address}_last_processed_time`;
                const lastProcessedTime = localStorage.getItem(lastProcessedKey);
                const currentTime = Date.now();

                // Only process if:
                // 1. Never processed before, or
                // 2. It's been more than 24 hours since last processing
                const shouldProcess =
                    !lastProcessedTime || currentTime - parseInt(lastProcessedTime) > 24 * 60 * 60 * 1000;

                if (shouldProcess) {
                    await this.processTransactionHistory(address, onProgress);
                    // Save the processing time
                    localStorage.setItem(lastProcessedKey, currentTime.toString());
                } else {
                    // Still check for new transactions since last login without full reprocessing
                    await this.refreshTransactionHistory(address, onProgress);
                }
            } catch (error) {
                walletLogger.error('Error processing initial transaction history:', error);
            }

            // Subscribe to updates
            await this.subscribeToWalletUpdates(address, onUpdate);
        } catch (error) {
            walletLogger.error('Error initializing wallet:', error);
            throw error;
        }
    }

    async sendTransaction(
        toAddress: string,
        amount: number,
        password?: string,
        options?: {
            strategy?: CoinSelectionStrategy;
            feeRate?: number;
            maxInputs?: number;
            minConfirmations?: number;
            changeAddress?: string; // Custom change address for HD wallets
            subtractFeeFromAmount?: boolean; // Whether to subtract fee from the send amount
        },
    ): Promise<string> {
        try {
            // Get current wallet data
            const activeWallet = await StorageService.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }

            let privateKeyWIF = activeWallet.privateKey;

            // Decrypt private key if encrypted
            if (activeWallet.isEncrypted) {
                if (!password) {
                    throw new Error('Password required for encrypted wallet');
                }
                try {
                    const { decrypted } = await decryptData(privateKeyWIF, password);
                    if (!decrypted) {
                        throw new Error('Invalid password');
                    }
                    privateKeyWIF = decrypted;
                } catch (error) {
                    throw new Error('Invalid password');
                }
            }

            // Create key pair from private key
            const keyPair = ECPair.fromWIF(privateKeyWIF, avianNetwork);
            const fromAddress = activeWallet.address;

            // Get UTXOs for the address
            const rawUTXOs = await this.electrum.getUTXOs(fromAddress);
            if (rawUTXOs.length === 0) {
                throw new Error('No unspent transaction outputs found');
            }

            // Enhance UTXOs with additional metadata
            const currentBlockHeight = await this.electrum.getCurrentBlockHeight();
            const enhancedUTXOs: EnhancedUTXO[] = rawUTXOs.map((utxo) => ({
                ...utxo,
                confirmations: utxo.height ? Math.max(0, currentBlockHeight - utxo.height + 1) : 0,
                isConfirmed: utxo.height ? currentBlockHeight - utxo.height + 1 >= 1 : false,
                ageInBlocks: utxo.height ? currentBlockHeight - utxo.height + 1 : 0,
                address: fromAddress,
            }));

            // Calculate total available amount
            const totalAvailable = enhancedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);

            // Define transaction fee and options
            const feeRate = options?.feeRate || 10000; // 0.0001 AVN = 10000 satoshis
            const totalRequired = amount + feeRate;

            if (totalAvailable < totalRequired) {
                throw new Error(
                    `Insufficient funds. Required: ${totalRequired} satoshis, Available: ${totalAvailable} satoshis`,
                );
            }

            // Select optimal UTXOs using the selection service
            const strategyRecommendation = UTXOSelectionService.getRecommendedStrategy(
                amount,
                enhancedUTXOs,
                {
                    consolidateDust: options?.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST,
                },
            );

            // Get wallet's own address for dust consolidation
            let selfAddress;
            if (
                strategyRecommendation.recommendSelfAddress ||
                options?.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST
            ) {
                const wallet = await StorageService.getActiveWallet();
                if (wallet) {
                    selfAddress = wallet.address;
                }
            }

            const selectionOptions: UTXOSelectionOptions = {
                strategy: options?.strategy || strategyRecommendation.strategy,
                targetAmount: amount,
                feeRate: feeRate,
                maxInputs: options?.maxInputs || 20,
                minConfirmations: options?.minConfirmations || 0,
                allowUnconfirmed: true,
                includeDust: options?.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST,
                isAutoConsolidation: options?.strategy === CoinSelectionStrategy.CONSOLIDATE_DUST,
                selfAddress: selfAddress,
            };

            const selectionResult = UTXOSelectionService.selectUTXOs(enhancedUTXOs, selectionOptions);

            if (!selectionResult) {
                throw new Error('Unable to select suitable UTXOs for transaction');
            }

            const { selectedUTXOs, change } = selectionResult;

            // Calculate final amounts based on subtractFeeFromAmount option
            let finalSendAmount = amount;
            let finalChange = change;

            if (options?.subtractFeeFromAmount) {
                // Subtract the estimated fee from the send amount
                const estimatedFee = (feeRate * 250) / 1000; // Rough estimate based on typical transaction size
                finalSendAmount = Math.max(0, amount - estimatedFee);
                // Recalculate change with the reduced send amount
                const totalInput = selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
                finalChange = totalInput - finalSendAmount - estimatedFee;
            }

            // Determine change address - use custom address if provided, otherwise sender's address
            const changeAddress =
                options?.changeAddress && options.changeAddress.trim() !== ''
                    ? options.changeAddress
                    : fromAddress;

            // Build transaction using PSBT
            const psbt = new bitcoin.Psbt({ network: avianNetwork });

            // Add inputs from selected UTXOs
            for (const utxo of selectedUTXOs) {
                const txHex = await this.electrum.getTransaction(utxo.txid, false);
                psbt.addInput({
                    hash: utxo.txid,
                    index: utxo.vout,
                    nonWitnessUtxo: Buffer.from(txHex, 'hex'),
                });
            }

            // Add output for recipient
            psbt.addOutput({
                address: toAddress,
                value: finalSendAmount,
            });

            // Add change output if needed
            if (finalChange > 0) {
                psbt.addOutput({
                    address: changeAddress,
                    value: finalChange,
                });
            }

            // Create a compatible signer object with Avian fork ID support
            // Avian uses SIGHASH_FORKID (0x40) to prevent replay attacks from other Bitcoin forks
            const SIGHASH_ALL = 0x01;
            const SIGHASH_FORKID = 0x40;
            const hashType = SIGHASH_ALL | SIGHASH_FORKID; // 0x41 - required for Avian transactions

            const signer = {
                publicKey: Buffer.from(keyPair.publicKey),
                sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash)),
            };

            try {
                // First, try the standard approach with sighash type array
                for (let i = 0; i < selectedUTXOs.length; i++) {
                    // Pass the hashType in the sighashTypes array to whitelist it
                    psbt.signInput(i, signer, [hashType]);
                }
            } catch (psbtError) {
                // Create transaction for signing
                const tx = new bitcoin.Transaction();
                tx.version = 2;
                tx.locktime = 0;

                // Add all inputs
                for (const u of selectedUTXOs) {
                    tx.addInput(Buffer.from(u.txid, 'hex').reverse(), u.vout);
                }

                // Add all outputs
                tx.addOutput(bitcoin.address.toOutputScript(toAddress, avianNetwork), finalSendAmount);
                if (finalChange > 0) {
                    tx.addOutput(bitcoin.address.toOutputScript(changeAddress, avianNetwork), finalChange);
                }

                // Sign each input manually with fork ID
                for (let i = 0; i < selectedUTXOs.length; i++) {
                    const utxo = selectedUTXOs[i];
                    const prevTxHex = await this.electrum.getTransaction(utxo.txid, false);
                    const prevTx = bitcoin.Transaction.fromHex(prevTxHex);

                    // Get the previous output script (scriptPubKey)
                    const prevOutScript = prevTx.outs[utxo.vout].script;

                    // Create the signature hash with fork ID
                    const signatureHash = tx.hashForSignature(i, prevOutScript, hashType);

                    // Sign the hash
                    const signature = keyPair.sign(signatureHash);
                    const derSignature = this.encodeDERWithCustomHashType(Buffer.from(signature), hashType);

                    // Build script sig (P2PKH: <signature> <publicKey>)
                    const scriptSig = bitcoin.script.compile([derSignature, Buffer.from(keyPair.publicKey)]);

                    tx.ins[i].script = scriptSig;
                }

                // Return the manually built transaction
                const txHex = tx.toHex();
                const txId = tx.getId();

                // Validate the transaction structure
                try {
                    const validateTx = bitcoin.Transaction.fromHex(txHex);

                    // Check each input has a valid script
                    for (let i = 0; i < validateTx.ins.length; i++) {
                        const script = validateTx.ins[i].script;
                        if (script.length === 0) {
                            throw new Error(`Input ${i} has empty script`);
                        }
                    }
                } catch (validationError) {
                    walletLogger.error('Transaction validation failed:', validationError);
                    throw new Error(`Invalid transaction created: ${validationError}`);
                }

                // Broadcast the transaction
                const broadcastResult = await this.electrum.broadcastTransaction(txHex);

                // Validate broadcast was successful before saving transaction
                if (!broadcastResult || typeof broadcastResult !== 'string') {
                    throw new Error('Transaction broadcast failed. Please try again later.');
                }

                // Save transaction to local history
                await StorageService.saveTransaction({
                    txid: txId,
                    amount: amount / 100000000, // Convert satoshis to AVN
                    address: toAddress,
                    fromAddress: fromAddress,
                    walletAddress: fromAddress,
                    type: 'send',
                    timestamp: new Date(),
                    confirmations: 0,
                });

                return txId;
            }

            // If PSBT signing succeeded, finalize and extract the transaction
            psbt.finalizeAllInputs();

            // Extract the raw transaction hex
            const tx = psbt.extractTransaction();
            const txHex = tx.toHex();
            const txId = tx.getId();

            // Broadcast the transaction
            const broadcastResult = await this.electrum.broadcastTransaction(txHex);

            // Validate broadcast was successful before saving transaction
            if (!broadcastResult || typeof broadcastResult !== 'string') {
                throw new Error('Transaction broadcast failed. Please try again later.');
            }

            // Save transaction to local history
            await StorageService.saveTransaction({
                txid: txId,
                amount: amount / 100000000, // Convert satoshis to AVN
                address: toAddress,
                fromAddress: fromAddress,
                walletAddress: fromAddress, // Add wallet address for proper multi-wallet support
                type: 'send',
                timestamp: new Date(),
                confirmations: 0,
            });

            return txId;
        } catch (error) {
            walletLogger.error('Error sending transaction:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Transaction failed: ${errorMessage}`);
        }
    }

    /**
     * Send transaction using manually selected UTXOs from multiple addresses
     */
    async sendTransactionWithManualUTXOs(
        toAddress: string,
        amount: number,
        manualUTXOs: EnhancedUTXO[],
        password?: string,
        options?: {
            feeRate?: number;
            changeAddress?: string;
            subtractFeeFromAmount?: boolean;
        },
    ): Promise<string> {
        try {
            // Get current wallet data
            const activeWallet = await StorageService.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }

            if (!manualUTXOs || manualUTXOs.length === 0) {
                throw new Error('No UTXOs provided for manual selection');
            }

            // Validate that we have sufficient funds
            const totalAvailable = manualUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
            const feeRate = options?.feeRate || 10000; // Default fee
            const totalRequired = amount + feeRate;

            if (totalAvailable < totalRequired) {
                throw new Error(
                    `Insufficient funds. Available: ${totalAvailable}, Required: ${totalRequired}`,
                );
            }

            let privateKeyWIF = activeWallet.privateKey;

            // Decrypt private key if encrypted
            if (activeWallet.isEncrypted) {
                if (!password) {
                    throw new Error('Password required for encrypted wallet');
                }
                try {
                    privateKeyWIF = await secureDecrypt(activeWallet.privateKey, password);
                } catch (error) {
                    throw new Error('Invalid password');
                }
            }

            // Check if we need HD wallet capabilities
            const hasHdUtxos = manualUTXOs.some(
                (utxo) => utxo.address && utxo.address !== activeWallet.address,
            );
            let hdRoot = null;
            let mnemonic = null;

            if (hasHdUtxos) {
                // Get mnemonic for HD wallet operations
                mnemonic = await StorageService.getMnemonic();
                if (!mnemonic) {
                    throw new Error(
                        'HD wallet UTXOs detected but no mnemonic found. Cannot sign from derived addresses.',
                    );
                }

                // Decrypt mnemonic if needed
                let decryptedMnemonic = mnemonic;
                if (activeWallet.isEncrypted && password) {
                    try {
                        decryptedMnemonic = await secureDecrypt(mnemonic, password);
                    } catch (error) {
                        // If mnemonic decryption fails, try using it as-is (might not be encrypted)
                        decryptedMnemonic = mnemonic;
                    }
                }

                // Create HD root from mnemonic
                const seed = await bip39.mnemonicToSeed(decryptedMnemonic);
                hdRoot = bip32.fromSeed(seed, avianNetwork);
            }

            // Helper function to get the correct key pair for an address
            const getKeyPairForAddress = async (address: string): Promise<any> => {
                if (address === activeWallet.address) {
                    // Main wallet address - use main private key
                    return ECPair.fromWIF(privateKeyWIF, avianNetwork);
                } else if (hdRoot) {
                    // HD address - derive the correct key
                    // We need to find which derivation path this address corresponds to
                    // Use the wallet's stored coin type for derivation
                    const coinType = activeWallet.coinType || 921;
                    // Check both receiving (0) and change (1) paths
                    for (const changePath of [0, 1]) {
                        for (let addressIndex = 0; addressIndex < 50; addressIndex++) {
                            // Check up to 50 addresses
                            const path = `m/44'/${coinType}'/0'/${changePath}/${addressIndex}`;
                            const child = hdRoot.derivePath(path);
                            const { address: derivedAddress } = bitcoin.payments.p2pkh({
                                pubkey: Buffer.from(child.publicKey),
                                network: avianNetwork,
                            });

                            if (derivedAddress === address) {
                                // Found the matching derivation path
                                return ECPair.fromPrivateKey(Buffer.from(child.privateKey!), {
                                    network: avianNetwork,
                                });
                            }
                        }
                    }
                    throw new Error(`Could not find derivation path for HD address: ${address}`);
                } else {
                    throw new Error(`Cannot sign UTXO from address ${address} - HD wallet not available`);
                }
            };

            // Manual transaction building (skip PSBT since it has sighash issues)
            const tx = new bitcoin.Transaction();
            tx.version = 2;

            // Add inputs
            for (const utxo of manualUTXOs) {
                tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout);
            }

            // Calculate actual amount and change
            const actualAmount = options?.subtractFeeFromAmount ? amount - feeRate : amount;
            const totalInput = manualUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
            const change = totalInput - actualAmount - feeRate;

            // Add outputs
            tx.addOutput(bitcoin.address.toOutputScript(toAddress, avianNetwork), actualAmount);

            if (change > 0) {
                const changeAddress = options?.changeAddress || activeWallet.address;
                tx.addOutput(bitcoin.address.toOutputScript(changeAddress, avianNetwork), change);
            }

            // Sign inputs with the correct private keys
            const SIGHASH_ALL = 0x01;
            const SIGHASH_FORKID = 0x40;
            const hashType = SIGHASH_ALL | SIGHASH_FORKID;

            for (let i = 0; i < manualUTXOs.length; i++) {
                const utxo = manualUTXOs[i];

                // Get the correct key pair for this UTXO's address
                if (!utxo.address) {
                    throw new Error('UTXO is missing address property');
                }
                const keyPair = await getKeyPairForAddress(utxo.address);

                // Create P2PKH script for this input
                const prevOutScript = bitcoin.address.toOutputScript(utxo.address, avianNetwork);

                // Calculate signature hash
                const signatureHash = tx.hashForSignature(i, prevOutScript, hashType);

                // Sign the hash
                const signature = keyPair.sign(signatureHash);
                const derSignature = this.encodeDERWithCustomHashType(Buffer.from(signature), hashType);

                // Build script sig (P2PKH: <signature> <publicKey>)
                const scriptSig = bitcoin.script.compile([derSignature, Buffer.from(keyPair.publicKey)]);

                tx.ins[i].script = scriptSig;
            }

            // Extract transaction
            const txHex = tx.toHex();
            const txId = tx.getId();

            // Broadcast the transaction
            const broadcastResult = await this.electrum.broadcastTransaction(txHex);

            if (!broadcastResult || typeof broadcastResult !== 'string') {
                throw new Error('Transaction broadcast failed. Please try again later.');
            }

            // Save transaction to local history
            await StorageService.saveTransaction({
                txid: txId,
                amount: actualAmount / 100000000, // Convert satoshis to AVN
                address: toAddress,
                fromAddress: activeWallet.address,
                walletAddress: activeWallet.address,
                type: 'send',
                timestamp: new Date(),
                confirmations: 0,
            });

            return txId;
        } catch (error) {
            walletLogger.error('Error sending transaction with manual UTXOs:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Transaction failed: ${errorMessage}`);
        }
    }
    async encryptWallet(password: string): Promise<void> {
        try {
            const privateKey = await StorageService.getPrivateKey();
            if (!privateKey) {
                throw new Error('No private key to encrypt');
            }

            // If already encrypted, throw error
            const isEncrypted = await StorageService.getIsEncrypted();
            if (isEncrypted) {
                throw new Error('Wallet is already encrypted');
            }

            // Encrypt private key
            const encryptedKey = await secureEncrypt(privateKey, password);
            await StorageService.setPrivateKey(encryptedKey);

            // Encrypt mnemonic if it exists
            const mnemonic = await StorageService.getMnemonic();
            if (mnemonic) {
                const encryptedMnemonic = await secureEncrypt(mnemonic, password);
                await StorageService.setMnemonic(encryptedMnemonic);
            }

            await StorageService.setIsEncrypted(true);
        } catch (error) {
            walletLogger.error('Error encrypting wallet:', error);
            throw error;
        }
    }

    async decryptWallet(password: string): Promise<void> {
        try {
            const encryptedKey = await StorageService.getPrivateKey();
            if (!encryptedKey) {
                throw new Error('No private key found');
            }

            const isEncrypted = await StorageService.getIsEncrypted();
            if (!isEncrypted) {
                throw new Error('Wallet is not encrypted');
            }

            // Decrypt private key
            const { decrypted: decryptedKey } = await decryptData(encryptedKey, password);
            if (!decryptedKey) {
                throw new Error('Invalid password');
            }

            await StorageService.setPrivateKey(decryptedKey);

            // Decrypt mnemonic if it exists
            const encryptedMnemonic = await StorageService.getMnemonic();
            if (encryptedMnemonic) {
                try {
                    const { decrypted: decryptedMnemonic } = await decryptData(encryptedMnemonic, password);
                    if (decryptedMnemonic) {
                        await StorageService.setMnemonic(decryptedMnemonic);
                    }
                } catch (mnemonicError) {
                    walletLogger.warn(
                        'Failed to decrypt mnemonic, but private key was decrypted successfully',
                    );
                }
            }

            await StorageService.setIsEncrypted(false);
        } catch (error) {
            walletLogger.error('Error decrypting wallet:', error);
            throw error;
        }
    }

    async exportPrivateKey(password?: string): Promise<string> {
        try {
            const storedPrivateKey = await StorageService.getPrivateKey();
            if (!storedPrivateKey) {
                throw new Error(
                    'No private key found. Private keys cannot be recreated - you must restore from a backup or generate a new wallet.',
                );
            }

            const isEncrypted = await StorageService.getIsEncrypted();

            if (isEncrypted && !password) {
                throw new Error('Password required for encrypted wallet');
            }

            let exportedKey: string;

            if (isEncrypted) {
                // Decrypt private key
                const { decrypted } = await decryptData(storedPrivateKey, password!);
                exportedKey = decrypted;
            } else {
                exportedKey = storedPrivateKey;
            }

            // Validate the decrypted key
            if (!exportedKey) {
                throw new Error('Failed to decrypt private key. Please check your password.');
            }

            // Validate WIF format
            try {
                ECPair.fromWIF(exportedKey, avianNetwork);
            } catch (wifError) {
                // If it's not WIF, try to convert it
                if (exportedKey.length === 64 && /^[0-9a-fA-F]+$/.test(exportedKey)) {
                    // It's a hex private key, convert to WIF
                    const privateKeyBuffer = Buffer.from(exportedKey, 'hex');
                    const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: avianNetwork });
                    exportedKey = keyPair.toWIF();
                } else {
                    throw new Error(
                        'Corrupted private key detected. The stored key is not in a valid format.',
                    );
                }
            }

            return exportedKey;
        } catch (error) {
            walletLogger.error('Error exporting private key:', error);
            throw error;
        }
    }

    async checkWalletRecoveryOptions(): Promise<{
        hasWallet: boolean;
        isEncrypted: boolean;
        hasMnemonic: boolean;
        recoveryOptions: string[];
    }> {
        try {
            const storedPrivateKey = await StorageService.getPrivateKey();
            const storedAddress = await StorageService.getAddress();
            const storedMnemonic = await StorageService.getMnemonic();
            const isEncrypted = await StorageService.getIsEncrypted();

            const hasWallet = !!(storedPrivateKey && storedAddress);
            const hasMnemonic = !!storedMnemonic;
            const recoveryOptions: string[] = [];

            if (!hasWallet) {
                recoveryOptions.push(
                    'Generate a new wallet (creates new private key, address, and mnemonic)',
                );
                recoveryOptions.push('Import existing private key (WIF format)');
                recoveryOptions.push('Restore from BIP39 mnemonic phrase (12 words)');
            }

            return {
                hasWallet,
                isEncrypted,
                hasMnemonic,
                recoveryOptions,
            };
        } catch (error) {
            walletLogger.error('Error checking wallet recovery options:', error);
            return {
                hasWallet: false,
                isEncrypted: false,
                hasMnemonic: false,
                recoveryOptions: [
                    'Generate a new wallet',
                    'Import existing private key',
                    'Restore from BIP39 mnemonic',
                    'Check browser storage permissions',
                ],
            };
        }
    }

    async validatePrivateKey(privateKey: string): Promise<boolean> {
        try {
            // Try to create an ECPair from the private key
            ECPair.fromWIF(privateKey, avianNetwork);
            return true;
        } catch (error) {
            walletLogger.error('Private key validation failed:', error);
            return false;
        }
    }

    /**
     * Validates if a password can successfully decrypt the wallet
     * @param password The password to validate
     * @returns True if the password is valid, false otherwise
     */
    async validateWalletPassword(password: string): Promise<boolean> {
        try {
            // First check if wallet is encrypted at all
            const isEncrypted = await StorageService.getIsEncrypted();

            if (!isEncrypted) {
                // If wallet is not encrypted, any password is valid
                return true;
            }

            // Try to decrypt either the mnemonic (if available) or private key
            const storedMnemonic = await StorageService.getMnemonic();
            if (storedMnemonic) {
                try {
                    const { decrypted: decryptedMnemonic } = await decryptData(storedMnemonic, password);
                    // Validate the decrypted mnemonic
                    return !!decryptedMnemonic && bip39.validateMnemonic(decryptedMnemonic);
                } catch (error) {
                    return false;
                }
            }

            // Try private key if no mnemonic
            const privateKeyWIF = await StorageService.getPrivateKey();
            if (privateKeyWIF) {
                try {
                    const { decrypted: decryptedKey } = await decryptData(privateKeyWIF, password);
                    // A valid private key should be 51-52 characters and starts with specific characters
                    return !!decryptedKey && decryptedKey.length >= 51 && decryptedKey.length <= 52;
                } catch (error) {
                    return false;
                }
            }

            // If we couldn't find anything to validate against
            return false;
        } catch (error) {
            walletLogger.error('Error validating wallet password:', error);
            return false;
        }
    }

    // Connection management methods
    async connectToElectrum(): Promise<void> {
        try {
            if (!this.electrum.isConnectedToServer()) {
                await this.electrum.connect();
            }
        } catch (error) {
            walletLogger.error('Failed to connect to ElectrumX server:', error);
            throw error;
        }
    }

    async disconnectFromElectrum(): Promise<void> {
        try {
            await this.electrum.disconnect();
        } catch (error) {
            walletLogger.error('Error disconnecting from ElectrumX server:', error);
            throw error;
        }
    }

    isConnectedToElectrum(): boolean {
        return this.electrum.isConnectedToServer();
    }

    getElectrumServerInfo(): { url: string; servers: any[] } {
        return {
            url: this.electrum.getServerUrl(),
            servers: this.electrum.getAvailableServers(),
        };
    }

    async selectElectrumServer(index: number): Promise<void> {
        try {
            this.electrum.selectServer(index);
            // Reconnect to the new server
            if (this.isConnectedToElectrum()) {
                await this.connectToElectrum();
            }
        } catch (error) {
            walletLogger.error('Error selecting ElectrumX server:', error);
            throw error;
        }
    }

    async testElectrumConnection(): Promise<boolean> {
        try {
            // First check if we're connected
            if (!this.electrum.isConnectedToServer()) {
                return false;
            }

            // If connected, try to ping
            await this.electrum.ping();
            return true;
        } catch (error) {
            walletLogger.error('ElectrumX connection test failed:', error);
            return false;
        }
    }

    async getElectrumServerVersion(): Promise<{ server: string; protocol: string }> {
        try {
            return await this.electrum.getServerVersion();
        } catch (error) {
            walletLogger.error('Failed to get server version:', error);
            throw error;
        }
    }

    async generateWalletFromMnemonic(
        mnemonic: string,
        password: string,
        passphrase?: string,
    ): Promise<LegacyWalletData> {
        // Validate required password
        if (!password || password.length < 8) {
            throw new Error('Password is required and must be at least 8 characters long');
        }

        try {
            // Validate mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid BIP39 mnemonic phrase');
            }

            // Derive seed from mnemonic with optional passphrase (BIP39 25th word)
            const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');

            // Create HD wallet root
            const root = bip32.fromSeed(seed, avianNetwork);

            // Derive key at standard path m/44'/921'/0'/0/0 (921 is Avian's coin type)
            const path = "m/44'/921'/0'/0/0";
            const child = root.derivePath(path);

            if (!child.privateKey) {
                throw new Error('Failed to derive private key from mnemonic');
            }

            // Create ECPair from derived private key
            const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });

            const privateKeyWIF = keyPair.toWIF();

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address from mnemonic');
            }

            // Encrypt private key with password (now mandatory)
            const finalPrivateKey = await secureEncrypt(privateKeyWIF, password);

            // Encrypt mnemonic with password (now mandatory)
            const finalMnemonic = await secureEncrypt(mnemonic, password);

            // Store mnemonic
            await StorageService.setMnemonic(finalMnemonic);

            return {
                address,
                privateKey: finalPrivateKey,
                mnemonic: finalMnemonic,
            };
        } catch (error) {
            walletLogger.error('Error generating wallet from mnemonic:', error);
            throw new Error('Failed to generate wallet from mnemonic');
        }
    }

    async validateMnemonic(mnemonic: string): Promise<boolean> {
        try {
            return bip39.validateMnemonic(mnemonic);
        } catch (error) {
            walletLogger.error('Mnemonic validation failed:', error);
            return false;
        }
    }

    async exportMnemonic(password?: string): Promise<string | null> {
        try {
            const storedMnemonic = await StorageService.getMnemonic();
            if (!storedMnemonic) {
                return null; // No mnemonic stored (wallet created without BIP39)
            }

            const isEncrypted = await StorageService.getIsEncrypted();

            if (isEncrypted && password) {
                try {
                    const { decrypted: decryptedMnemonic } = await decryptData(storedMnemonic, password);
                    if (!decryptedMnemonic) {
                        throw new Error('Failed to decrypt mnemonic');
                    }
                    return decryptedMnemonic;
                } catch (error) {
                    throw new Error('Invalid password or corrupted mnemonic');
                }
            } else if (!isEncrypted) {
                return storedMnemonic;
            } else {
                throw new Error('Password required for encrypted wallet');
            }
        } catch (error) {
            walletLogger.error('Error exporting mnemonic:', error);
            throw error;
        }
    }

    // Utility method to open transaction in block explorer
    static openTransactionInExplorer(txid: string): void {
        const explorerUrl = `https://explorer.avn.network/tx/?txid=${txid}`;
        window.open(explorerUrl, '_blank', 'noopener,noreferrer');
    }

    // Utility method to get explorer URL for a transaction
    static getExplorerUrl(txid: string): string {
        return `https://explorer.avn.network/tx/?txid=${txid}`;
    }

    // Utility method for testing WIF compatibility
    static testWIFCompatibility(testWIF?: string): {
        success: boolean;
        address: string;
        error?: string;
    } {
        try {
            // If no test WIF provided, generate one
            const keyPair = testWIF
                ? ECPair.fromWIF(testWIF, avianNetwork)
                : ECPair.makeRandom({ network: avianNetwork });

            // Get the WIF
            const wif = keyPair.toWIF();

            // Decode it back
            const decodedKeyPair = ECPair.fromWIF(wif, avianNetwork);

            // Generate address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(decodedKeyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address from WIF');
            }

            return {
                success: true,
                address: address,
            };
        } catch (error) {
            walletLogger.error('WIF compatibility test failed:', error);
            return {
                success: false,
                address: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // Utility method for testing both coin types to help users import legacy wallets
    static async detectCoinTypeFromMnemonic(
        mnemonic: string,
        passphrase?: string,
    ): Promise<{
        coinType921: { address: string; path: string };
        coinType175: { address: string; path: string };
        recommendation: string;
    }> {
        try {
            // Validate mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid BIP39 mnemonic');
            }

            // Derive seed from mnemonic
            const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');
            const root = bip32.fromSeed(seed, avianNetwork);

            // Test both coin types
            const results = {
                coinType921: { address: '', path: "m/44'/921'/0'/0/0" },
                coinType175: { address: '', path: "m/44'/175'/0'/0/0" },
                recommendation: '',
            };

            // Test coin type 921 (Avian)
            try {
                const child921 = root.derivePath(results.coinType921.path);
                if (child921.privateKey) {
                    const keyPair921 = ECPair.fromPrivateKey(child921.privateKey, { network: avianNetwork });
                    const { address: addr921 } = bitcoin.payments.p2pkh({
                        pubkey: Buffer.from(keyPair921.publicKey),
                        network: avianNetwork,
                    });
                    if (addr921) {
                        results.coinType921.address = addr921;
                    }
                }
            } catch (error) {
                walletLogger.warn('Failed to derive address for coin type 921:', error);
            }

            // Test coin type 175 (Ravencoin legacy)
            try {
                const child175 = root.derivePath(results.coinType175.path);
                if (child175.privateKey) {
                    const keyPair175 = ECPair.fromPrivateKey(child175.privateKey, { network: avianNetwork });
                    const { address: addr175 } = bitcoin.payments.p2pkh({
                        pubkey: Buffer.from(keyPair175.publicKey),
                        network: avianNetwork,
                    });
                    if (addr175) {
                        results.coinType175.address = addr175;
                    }
                }
            } catch (error) {
                walletLogger.warn('Failed to derive address for coin type 175:', error);
            }

            // Provide recommendation
            if (results.coinType921.address && results.coinType175.address) {
                results.recommendation =
                    'Both coin types generated valid addresses. Use 921 (Avian) for new wallets, or 175 if this wallet was created with Ravencoin compatibility.';
            } else if (results.coinType921.address) {
                results.recommendation = 'Use coin type 921 (Avian standard)';
            } else if (results.coinType175.address) {
                results.recommendation = 'Use coin type 175 (Ravencoin legacy compatibility)';
            } else {
                results.recommendation = 'Unable to derive addresses from this mnemonic';
            }

            return results;
        } catch (error) {
            walletLogger.error('Error detecting coin type from mnemonic:', error);
            throw new Error('Failed to analyze mnemonic for coin type detection');
        }
    }

    // Utility method for testing BIP39 mnemonic compatibility
    static async testMnemonicCompatibility(
        testMnemonic?: string,
    ): Promise<{ success: boolean; address: string; mnemonic: string; error?: string }> {
        try {
            // If no test mnemonic provided, generate one
            const mnemonic = testMnemonic || bip39.generateMnemonic(128);

            // Validate mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid BIP39 mnemonic');
            }

            // Derive seed from mnemonic
            const seed = await bip39.mnemonicToSeed(mnemonic);

            // Create HD wallet root
            const root = bip32.fromSeed(seed, avianNetwork);

            // Derive key at standard path m/44'/921'/0'/0/0
            const path = "m/44'/921'/0'/0/0";
            const child = root.derivePath(path);

            if (!child.privateKey) {
                throw new Error('Failed to derive private key from mnemonic');
            }

            // Create ECPair from derived private key
            const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });

            // Generate address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address from mnemonic');
            }

            return {
                success: true,
                address: address,
                mnemonic: mnemonic,
            };
        } catch (error) {
            walletLogger.error('Mnemonic compatibility test failed:', error);
            return {
                success: false,
                address: '',
                mnemonic: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // Multi-wallet support methods
    async createNewWallet(params: {
        name: string;
        password: string; // Now required for security
        useMnemonic?: boolean;
        mnemonic?: string; // Optional: use specific mnemonic instead of generating new one
        passphrase?: string; // Optional BIP39 passphrase
        mnemonicLength?: 128 | 256; // 12 or 24 words (default: 128)
        makeActive?: boolean;
    }): Promise<WalletData> {
        try {
            // Validate required password
            if (!params.password || params.password.length < 8) {
                throw new Error('Password is required and must be at least 8 characters long');
            }
            let keyPair: any;
            let mnemonic: string | undefined;

            if (params.useMnemonic !== false) {
                // Use provided mnemonic or generate a new one
                if (params.mnemonic) {
                    // Validate provided mnemonic
                    if (!bip39.validateMnemonic(params.mnemonic)) {
                        throw new Error('Invalid mnemonic provided');
                    }
                    mnemonic = params.mnemonic;
                } else {
                    // Generate BIP39 mnemonic with specified length (default: 128 bits = 12 words)
                    const entropyBits = params.mnemonicLength || 128;
                    mnemonic = bip39.generateMnemonic(entropyBits); // 12 or 24 words
                }

                // Derive seed from mnemonic with optional passphrase
                const seed = await bip39.mnemonicToSeed(mnemonic, params.passphrase || '');

                // Create HD wallet root
                const root = bip32.fromSeed(seed, avianNetwork);

                // Derive key at standard path m/44'/921'/0'/0/0
                const path = "m/44'/921'/0'/0/0";
                const child = root.derivePath(path);

                if (!child.privateKey) {
                    throw new Error('Failed to derive private key from mnemonic');
                }

                // Create ECPair from derived private key
                keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });
            } else {
                // Generate a random key pair directly
                keyPair = ECPair.makeRandom({ network: avianNetwork });
            }

            const privateKeyWIF = keyPair.toWIF();

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address');
            }

            // Encrypt private key with password (now mandatory)
            const finalPrivateKey = await secureEncrypt(privateKeyWIF, params.password);

            // Encrypt mnemonic with password (now mandatory if mnemonic exists)
            let finalMnemonic: string | undefined;
            if (mnemonic) {
                finalMnemonic = await secureEncrypt(mnemonic, params.password);
            }

            // Encrypt BIP39 passphrase if provided
            let encryptedPassphrase: string | undefined;
            if (params.passphrase) {
                encryptedPassphrase = await secureEncrypt(params.passphrase, params.password);
            }

            // Create wallet in storage
            const walletData = await StorageService.createWallet({
                name: params.name,
                address,
                privateKey: finalPrivateKey,
                mnemonic: finalMnemonic,
                bip39Passphrase: encryptedPassphrase,
                coinType: 921, // Always use standard Avian coin type for new wallets
                isEncrypted: true, // Always encrypted now
                makeActive: params.makeActive,
            });

            return walletData;
        } catch (error) {
            walletLogger.error('Error creating wallet:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to create wallet: ${errorMessage}`);
        }
    }

    async importWalletFromMnemonic(params: {
        name: string;
        mnemonic: string;
        password: string; // Now required for security
        passphrase?: string; // Optional BIP39 passphrase (25th word)
        coinType?: 921 | 175; // BIP44 coin type for legacy compatibility (default: 921)
        makeActive?: boolean;
    }): Promise<WalletData> {
        try {
            // Validate required password
            if (!params.password || params.password.length < 8) {
                throw new Error('Password is required and must be at least 8 characters long');
            }

            // Validate mnemonic
            if (!bip39.validateMnemonic(params.mnemonic)) {
                throw new Error('Invalid mnemonic phrase');
            }

            // Derive seed from mnemonic with optional passphrase
            const seed = await bip39.mnemonicToSeed(params.mnemonic, params.passphrase || '');

            // Create HD wallet root
            const root = bip32.fromSeed(seed, avianNetwork);

            // Derive key using the specified coin type (default: 921 for Avian, optional: 175 for legacy compatibility)
            const coinType = params.coinType || 921;
            const path = `m/44'/${coinType}'/0'/0/0`;
            walletLogger.info(
                `Importing wallet using derivation path: ${path} (coin type ${coinType === 921 ? 'Avian' : 'Ravencoin Legacy'})`,
            );
            const child = root.derivePath(path);

            if (!child.privateKey) {
                throw new Error('Failed to derive private key from mnemonic');
            }

            // Create ECPair from derived private key
            const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });
            const privateKeyWIF = keyPair.toWIF();

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address from mnemonic');
            }

            // Check if wallet already exists
            if (await StorageService.walletExists(address)) {
                throw new Error('Wallet with this address already exists');
            }

            // Encrypt private key with password (now mandatory)
            const finalPrivateKey = await secureEncrypt(privateKeyWIF, params.password);

            // Encrypt mnemonic with password (now mandatory)
            const finalMnemonic = await secureEncrypt(params.mnemonic, params.password);

            // Encrypt passphrase if provided
            let encryptedPassphrase: string | undefined = undefined;
            if (params.passphrase) {
                encryptedPassphrase = await secureEncrypt(params.passphrase, params.password);
                walletLogger.debug('BIP39 passphrase encrypted and stored securely');
            }

            // Create wallet in storage
            const walletData = await StorageService.createWallet({
                name: params.name,
                address,
                privateKey: finalPrivateKey,
                mnemonic: finalMnemonic,
                bip39Passphrase: encryptedPassphrase,
                coinType: coinType, // Store the coin type used for derivation
                isEncrypted: true,
                makeActive: params.makeActive,
            });

            return walletData;
        } catch (error) {
            walletLogger.error('Error importing wallet from mnemonic:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to import wallet: ${errorMessage}`);
        }
    }

    async importWalletFromPrivateKey(params: {
        name: string;
        privateKey: string;
        password: string; // Now required for security
        makeActive?: boolean;
    }): Promise<WalletData> {
        try {
            // Validate required password
            if (!params.password || params.password.length < 8) {
                throw new Error('Password is required and must be at least 8 characters long');
            }

            let keyPair: any;
            let decryptedKey = params.privateKey;

            // Helper function to check if a string is a valid WIF private key
            const isValidWIF = (key: string): boolean => {
                try {
                    // WIF keys should be base58 encoded and start with specific characters
                    // For Avian network, they typically start with 'K', 'L', or '5'
                    if (!/^[5KL][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(key)) {
                        return false;
                    }

                    // Try to create ECPair to validate
                    const ECPair = ECPairFactory(ecc);
                    ECPair.fromWIF(key, avianNetwork);
                    return true;
                } catch {
                    return false;
                }
            };

            // Check if the private key is encrypted by trying to parse it as WIF first
            if (!isValidWIF(params.privateKey)) {
                // This doesn't look like a valid WIF key, it's likely encrypted
                try {
                    const { decrypted } = await decryptData(params.privateKey, params.password);
                    decryptedKey = decrypted;

                    // Validate the decrypted key is a valid WIF
                    if (!isValidWIF(decryptedKey)) {
                        throw new Error('Decrypted data is not a valid WIF private key');
                    }
                } catch (e) {
                    // If decryption fails or produces invalid WIF, it's an error
                    throw new Error('Invalid private key format or incorrect password');
                }
            }

            if (!decryptedKey) {
                throw new Error('Invalid private key or password');
            }

            // Import the private key
            try {
                keyPair = ECPair.fromWIF(decryptedKey, avianNetwork);
            } catch (error) {
                throw new Error('Invalid private key format');
            }

            // Get the address
            const { address } = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            if (!address) {
                throw new Error('Failed to generate address from private key');
            }

            // Check if wallet already exists
            if (await StorageService.walletExists(address)) {
                throw new Error('Wallet with this address already exists');
            }

            // Encrypt private key with password (now mandatory)
            const finalPrivateKey = await secureEncrypt(decryptedKey, params.password);

            // Create wallet in storage
            const walletData = await StorageService.createWallet({
                name: params.name,
                address,
                privateKey: finalPrivateKey,
                isEncrypted: true, // Always encrypted now
                makeActive: params.makeActive,
            });

            return walletData;
        } catch (error) {
            walletLogger.error('Error importing wallet from private key:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to import wallet: ${errorMessage}`);
        }
    }

    async getAllWallets(): Promise<WalletData[]> {
        return await StorageService.getAllWallets();
    }

    async getActiveWallet(): Promise<WalletData | null> {
        return await StorageService.getActiveWallet();
    }

    async switchWallet(walletId: number): Promise<boolean> {
        return await StorageService.switchToWallet(walletId);
    }

    async updateWalletName(walletId: number, newName: string): Promise<boolean> {
        return await StorageService.updateWalletName(walletId, newName);
    }

    async deleteWallet(walletId: number): Promise<boolean> {
        return await StorageService.deleteWallet(walletId);
    }

    async getWalletCount(): Promise<number> {
        return await StorageService.getWalletCount();
    }

    // Export mnemonic for active wallet
    async exportActiveWalletMnemonic(password?: string): Promise<string> {
        const wallet = await this.getActiveWallet();
        if (!wallet || !wallet.mnemonic) {
            throw new Error('No mnemonic available for current wallet');
        }

        if (wallet.isEncrypted && !password) {
            throw new Error('Password required to decrypt mnemonic');
        }

        if (wallet.isEncrypted && password) {
            try {
                const { decrypted } = await decryptData(wallet.mnemonic, password);
                if (!decrypted) {
                    throw new Error('Invalid password');
                }
                return decrypted;
            } catch (error) {
                throw new Error('Invalid password');
            }
        }

        return wallet.mnemonic;
    }

    // Export private key for active wallet
    async exportActiveWalletPrivateKey(password?: string): Promise<string> {
        const wallet = await this.getActiveWallet();
        if (!wallet) {
            throw new Error('No active wallet');
        }

        if (wallet.isEncrypted && !password) {
            throw new Error('Password required to decrypt private key');
        }

        if (wallet.isEncrypted && password) {
            try {
                const { decrypted, wasLegacy } = await decryptData(wallet.privateKey, password);
                if (wasLegacy) {
                    walletLogger.info(`Upgrading encryption for wallet: ${wallet.name}`);
                    const newEncryptedKey = await secureEncrypt(decrypted, password);
                    await StorageService.updateWalletPrivateKey(wallet.id!, newEncryptedKey);
                }
                return decrypted;
            } catch (error) {
                throw new Error('Invalid password');
            }
        }

        return wallet.privateKey;
    }

    async getTransactionHistory(address?: string): Promise<any[]> {
        try {
            // If no address provided, use the active wallet's address
            if (!address) {
                const activeWallet = await this.getActiveWallet();
                if (activeWallet) {
                    address = activeWallet.address;
                }
            }

            return await StorageService.getTransactionHistory(address);
        } catch (error) {
            walletLogger.error('Error getting transaction history:', error);
            return [];
        }
    }

    private async calculateConfirmations(blockHeight?: number): Promise<number> {
        if (!blockHeight) {
            return 0; // Unconfirmed transaction
        }

        try {
            const currentHeight = await this.electrum.getCurrentBlockHeight();
            if (currentHeight === 0) {
                // If we can't get current height, assume 1 confirmation for confirmed transactions
                return 1;
            }

            const confirmations = Math.max(0, currentHeight - blockHeight + 1);
            return confirmations;
        } catch (error) {
            walletLogger.error('Error calculating confirmations:', error);
            // Fallback: return 1 for confirmed transactions, 0 for unconfirmed
            return blockHeight ? 1 : 0;
        }
    }

    /**
     * Process transaction history for a wallet address
     * @param address - The wallet address
     * @param onProgress - Optional callback for progress updates (currently unused in implementation)
     * @param onlyNewTransactions - Whether to process only new transactions
     */
    async processTransactionHistory(
        address: string,
        onProgress?: (processed: number, total: number, currentTx?: string) => void,
        onlyNewTransactions: boolean = false,
    ): Promise<void> {
        try {
            // Get transaction history from ElectrumX
            const txHistory = await this.electrum.getTransactionHistory(address);

            if (!txHistory || txHistory.length === 0) {
                return;
            }

            // If we only want new transactions, get existing ones from storage
            let existingTxHashes: Set<string> = new Set();
            if (onlyNewTransactions) {
                const existingTransactions = await StorageService.getTransactionHistory(address);
                existingTxHashes = new Set(existingTransactions.map((tx) => tx.txid));
            }

            // Get existing transactions from local storage
            const existingTxs = await StorageService.getTransactionHistory(address);

            // Create maps for faster lookups
            const existingTxMap = new Map(existingTxs.map((tx) => [`${tx.txid}-${tx.type}`, tx]));
            const existingTxIdSet = new Set(existingTxs.map((tx) => tx.txid));

            // Get the total to process (might include some existing ones that need updating)
            const total = txHistory.length;
            let processedCount = 0;
            let updatedCount = 0;

            // Report initial progress
            onProgress?.(0, total);

            // Process each transaction from history (both new and existing for updates)
            for (const historyTx of txHistory) {
                try {
                    // Skip already processed transactions if onlyNewTransactions is true
                    if (onlyNewTransactions && existingTxIdSet.has(historyTx.tx_hash)) {
                        // Still count as processed for progress reporting
                        processedCount++;
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                        continue;
                    }
                    // Get detailed transaction information
                    const txDetails = await this.electrum.getTransaction(historyTx.tx_hash, true);
                    if (!txDetails) {
                        processedCount++;
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                        continue;
                    }

                    // Classify transaction as sent or received
                    const classification = await this.classifyTransaction(txDetails, address);
                    if (!classification) {
                        processedCount++;
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                        continue;
                    }

                    // Calculate proper confirmations
                    const confirmations = await this.calculateConfirmations(historyTx.height);

                    // Check if we have an existing transaction of this type
                    const existingTx = existingTxMap.get(`${historyTx.tx_hash}-${classification.type}`);

                    // Create the transaction object with all required fields
                    const updatedTx = {
                        txid: historyTx.tx_hash,
                        amount: classification.amount / 100000000, // Convert satoshis to AVN
                        address: classification.toAddress,
                        fromAddress: classification.fromAddress,
                        walletAddress: address, // Ensure wallet address is set for proper multi-wallet support
                        type: classification.type,
                        timestamp: new Date(txDetails.time ? txDetails.time * 1000 : Date.now()),
                        confirmations: confirmations,
                        blockHeight: historyTx.height || undefined,
                    };

                    // Check if we need to update an existing transaction
                    if (existingTx) {
                        // Only update if data has changed
                        const needsUpdate =
                            existingTx.amount !== updatedTx.amount ||
                            existingTx.address !== updatedTx.address ||
                            existingTx.fromAddress !== updatedTx.fromAddress ||
                            existingTx.confirmations !== updatedTx.confirmations ||
                            !existingTx.walletAddress; // Always update if walletAddress is missing

                        if (needsUpdate) {
                            try {
                                // Update with existing ID - using the raw object modification
                                // to avoid TypeScript issues with the ID property
                                const txWithId = { ...updatedTx } as any;
                                txWithId.id = existingTx.id;
                                await StorageService.saveTransaction(txWithId);
                                updatedCount++;
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : String(error);
                                walletLogger.warn(
                                    `Failed to update existing transaction ${historyTx.tx_hash}: ${errorMsg}`,
                                );
                                // Continue processing other transactions even if this one fails
                            }
                        }
                    } else if (!existingTxIdSet.has(historyTx.tx_hash) || classification.type === 'send') {
                        // Always save send transactions
                        try {
                            // This is a new transaction, save it
                            await StorageService.saveTransaction(updatedTx);
                            updatedCount++;
                        } catch (error) {
                            const errorMsg = error instanceof Error ? error.message : String(error);
                            walletLogger.warn(`Failed to save new transaction ${historyTx.tx_hash}: ${errorMsg}`);
                            // Continue processing other transactions even if this one fails
                        }
                    }

                    processedCount++;
                    onProgress?.(processedCount, total, historyTx.tx_hash);
                } catch (error) {
                    walletLogger.error(`Error processing transaction ${historyTx.tx_hash}:`, error);
                    processedCount++;
                    onProgress?.(processedCount, total, historyTx.tx_hash);
                }
            }

            // Report final progress
            if (total > 0) {
                onProgress?.(processedCount, total);
            }
        } catch (error) {
            walletLogger.error('Error processing transaction history:', error);
        }
    }

    /**
     * Refresh transaction history, focusing only on new transactions
     * @param address - Optional wallet address, will use active wallet if not provided
     * @param onProgress - Optional progress callback (currently unused in implementation)
     */
    async refreshTransactionHistory(
        address?: string,
        onProgress?: (processed: number, total: number, currentTx?: string) => void,
    ): Promise<void> {
        try {
            // If no address provided, use the active wallet's address
            if (!address) {
                const activeWallet = await this.getActiveWallet();
                if (activeWallet) {
                    address = activeWallet.address;
                }
            }

            if (address) {
                // Only process new transactions during regular refresh
                await this.processTransactionHistory(address, onProgress, true);
            } else {
                walletLogger.warn('No address available to refresh transaction history');
            }
        } catch (error) {
            walletLogger.error('Error refreshing transaction history:', error);
            throw error;
        }
    }

    private async isTransactionReceived(txDetails: any, address: string): Promise<boolean> {
        // First check if this transaction is already stored as a sent transaction
        const existingTxs = await StorageService.getTransactionHistory(address);
        const existingSentTx = existingTxs.find(
            (tx) => tx.txid === txDetails.txid && tx.type === 'send',
        );

        if (existingSentTx) {
            return false;
        }

        // Check if any output is directed to our address
        let hasOutputToUs = false;
        if (txDetails.vout) {
            for (const output of txDetails.vout) {
                if (output.scriptPubKey && output.scriptPubKey.addresses) {
                    if (output.scriptPubKey.addresses.includes(address)) {
                        hasOutputToUs = true;
                        break;
                    }
                }
            }
        }

        if (!hasOutputToUs) {
            return false;
        }

        // Check if any inputs belong specifically to this address
        // (we want to allow transactions between our wallets to show as received)
        if (txDetails.vin) {
            for (const input of txDetails.vin) {
                // Check for direct address field
                if (input.address && input.address === address) {
                    return false;
                }

                // Check scriptSig.addresses
                if (input.scriptSig && input.scriptSig.addresses) {
                    for (const inputAddress of input.scriptSig.addresses) {
                        if (inputAddress === address) {
                            return false;
                        }
                    }
                }

                // If no direct address info, check previous transaction
                if (input.txid && input.vout !== undefined) {
                    try {
                        const prevTxDetails = await this.electrum.getTransaction(input.txid, true);
                        if (prevTxDetails && prevTxDetails.vout && prevTxDetails.vout[input.vout]) {
                            const prevOutput = prevTxDetails.vout[input.vout];
                            if (prevOutput.scriptPubKey && prevOutput.scriptPubKey.addresses) {
                                for (const inputAddress of prevOutput.scriptPubKey.addresses) {
                                    if (inputAddress === address) {
                                        return false;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        walletLogger.warn(
                            `Failed to get previous transaction ${input.txid} for input analysis:`,
                            error,
                        );
                    }
                }
            }
        }

        // If we reach here, there's an output to us but no inputs from this specific address
        return true;
    }

    private calculateReceivedAmount(txDetails: any, address: string): number {
        let totalReceived = 0;

        if (txDetails.vout) {
            for (const output of txDetails.vout) {
                if (output.scriptPubKey && output.scriptPubKey.addresses) {
                    if (output.scriptPubKey.addresses.includes(address)) {
                        // Handle both number and string values for output.value
                        const valueStr = output.value.toString();
                        const value = parseFloat(valueStr);

                        // If the value is already in satoshis (large numbers like 2000000000)
                        if (value > 100000000 && !valueStr.includes('.')) {
                            totalReceived += value;
                        } else {
                            // Otherwise convert to satoshis
                            totalReceived += Math.round(value * 100000000);
                        }
                    }
                }
            }
        }

        return totalReceived;
    }

    private getSenderAddress(txDetails: any): string {
        // Try to get the first input address as sender
        if (txDetails.vin && txDetails.vin.length > 0) {
            const firstInput = txDetails.vin[0];

            // Skip coinbase transactions
            if (firstInput.coinbase) {
                return 'Coinbase';
            }

            // Check for direct address field first (more common in modern ElectrumX)
            if (firstInput.address) {
                return firstInput.address;
            }

            // Fallback to scriptSig.addresses for legacy format
            if (
                firstInput.scriptSig &&
                firstInput.scriptSig.addresses &&
                firstInput.scriptSig.addresses.length > 0
            ) {
                return firstInput.scriptSig.addresses[0];
            }

            // If no direct address available, we'd need to look up the previous transaction
            // This is handled in the classifyTransaction method
            if (firstInput.txid && firstInput.vout !== undefined) {
                return 'Unknown (requires lookup)';
            }
        }
        return 'External'; // Use a more descriptive placeholder
    }

    /**
     * Classify a transaction as sent, received, or neither (not related to our address)
     */
    private async classifyTransaction(
        txDetails: any,
        address: string,
    ): Promise<{
        type: 'send' | 'receive';
        amount: number;
        fromAddress: string;
        toAddress: string;
    } | null> {
        try {
            // Enhanced transaction classification for better multi-wallet support

            // Check if we have inputs (spending from our address)
            let hasInputFromUs = false;
            let inputFromCurrentAddress = false;
            let inputAddresses: string[] = [];
            let totalInputValue = 0; // Track input value for fee calculation

            if (txDetails.vin) {
                for (const input of txDetails.vin) {
                    // Skip coinbase transactions (no previous output)
                    if (input.coinbase) {
                        continue;
                    }

                    // Track input value when available
                    if (input.value) {
                        totalInputValue += Math.round(parseFloat(input.value.toString()) * 100000000);
                    }

                    // Check if input has an address field directly (some ElectrumX servers provide this)
                    if (input.address) {
                        inputAddresses.push(input.address);
                        if (input.address === address) {
                            inputFromCurrentAddress = true;
                            hasInputFromUs = true;
                        } else if (await this.isOurAddress(input.address)) {
                            hasInputFromUs = true;
                        }
                    }
                    // Also check scriptSig.addresses for legacy format
                    else if (input.scriptSig && input.scriptSig.addresses) {
                        for (const inputAddress of input.scriptSig.addresses) {
                            inputAddresses.push(inputAddress);
                            if (inputAddress === address) {
                                inputFromCurrentAddress = true;
                                hasInputFromUs = true;
                            } else if (await this.isOurAddress(inputAddress)) {
                                hasInputFromUs = true;
                            }
                        }
                    }
                    // If no direct address, we need to look up the previous transaction output
                    else if (input.txid && input.vout !== undefined) {
                        try {
                            const prevTxDetails = await this.electrum.getTransaction(input.txid, true);
                            if (prevTxDetails && prevTxDetails.vout && prevTxDetails.vout[input.vout]) {
                                const prevOutput = prevTxDetails.vout[input.vout];

                                // Track input value from previous transaction
                                if (prevOutput.value) {
                                    totalInputValue += Math.round(
                                        parseFloat(prevOutput.value.toString()) * 100000000,
                                    );
                                }

                                if (prevOutput.scriptPubKey && prevOutput.scriptPubKey.addresses) {
                                    for (const inputAddress of prevOutput.scriptPubKey.addresses) {
                                        inputAddresses.push(inputAddress);
                                        if (inputAddress === address) {
                                            inputFromCurrentAddress = true;
                                            hasInputFromUs = true;
                                        } else if (await this.isOurAddress(inputAddress)) {
                                            hasInputFromUs = true;
                                        }
                                    }
                                }
                            }
                        } catch (prevTxError) {
                            walletLogger.warn(
                                `Failed to get previous transaction ${input.txid} for input analysis:`,
                                prevTxError,
                            );
                        }
                    }
                }
            }

            // Check if we have outputs (receiving to our address)
            let hasOutputToUs = false;
            let hasOutputToCurrentAddress = false;
            let totalOutputToUs = 0;
            let totalOutputToCurrentAddress = 0;
            let totalOutputToOthers = 0;
            let totalOutputValue = 0; // Track total output for fee calculation
            let firstOutputToOthers = '';
            let outputsToOthers: Array<{ address: string; value: number }> = [];

            if (txDetails.vout) {
                for (let i = 0; i < txDetails.vout.length; i++) {
                    const output = txDetails.vout[i];
                    if (output.scriptPubKey && output.scriptPubKey.addresses) {
                        // Handle both number and string values for output.value
                        const outputValue = Math.round(parseFloat(output.value.toString()) * 100000000); // Convert to satoshis
                        totalOutputValue += outputValue;
                        const outputAddresses = output.scriptPubKey.addresses;

                        // Check if this output goes to our address or any of our addresses
                        let isOurOutput = false;
                        let isTargetAddress = false;
                        for (const outputAddr of outputAddresses) {
                            if (outputAddr === address) {
                                isTargetAddress = true;
                                isOurOutput = true;
                                break;
                            } else {
                                const isOurAddr = await this.isOurAddress(outputAddr);
                                if (isOurAddr) {
                                    isOurOutput = true;
                                    break;
                                }
                            }
                        }

                        if (isTargetAddress) {
                            // This output goes to the specific address we're analyzing
                            hasOutputToCurrentAddress = true;
                            hasOutputToUs = true;
                            totalOutputToUs += outputValue;
                            totalOutputToCurrentAddress += outputValue;
                        } else if (isOurOutput) {
                            // This output goes to one of our other wallets (like change)
                            hasOutputToUs = true;
                            totalOutputToUs += outputValue;
                            // Don't add to totalOutputToCurrentAddress since it's not to the target address
                        } else {
                            // This output goes to an external address
                            totalOutputToOthers += outputValue;
                            if (!firstOutputToOthers && outputAddresses.length > 0) {
                                firstOutputToOthers = outputAddresses[0];
                            }

                            // Store all outputs to external addresses
                            outputsToOthers.push({
                                address: outputAddresses[0],
                                value: outputValue,
                            });
                        }
                    }
                }
            }

            // Calculate the transaction fee if we have all input values
            const fee = totalInputValue > 0 ? totalInputValue - totalOutputValue : 0;

            // Special multi-wallet handling - distinguish between external receives and internal transfers
            // These variables are calculated for future features (wallet-to-wallet transfer detection)
            // TODO: Implement special handling for self transfers and transfers between owned wallets
            const isSelfTransfer =
                inputFromCurrentAddress && hasOutputToCurrentAddress && outputsToOthers.length === 0;
            const isTransferBetweenOurWallets =
                hasInputFromUs && !inputFromCurrentAddress && hasOutputToCurrentAddress;

            // Handle special case where we're checking a specific address
            if (!inputFromCurrentAddress && hasOutputToCurrentAddress) {
                // If we're analyzing a specific address that received funds but didn't spend any,
                // this is a receive transaction for this address

                // Check if it's from another of our wallets
                // fromIsOurWallet is calculated for future features (wallet-to-wallet transfer identification)
                let fromIsOurWallet = false;
                let senderAddress = '';

                if (inputAddresses.length > 0) {
                    for (const inputAddr of inputAddresses) {
                        if (await this.isOurAddress(inputAddr)) {
                            fromIsOurWallet = true;
                            senderAddress = inputAddr;
                            break;
                        }
                    }

                    // If no specific sender found, use the first input
                    if (!senderAddress) {
                        senderAddress = inputAddresses[0];
                    }
                } else {
                    senderAddress = this.getSenderAddress(txDetails);
                }

                return {
                    type: 'receive',
                    amount: totalOutputToCurrentAddress,
                    fromAddress: senderAddress,
                    toAddress: address,
                };
            }

            // Classify the transaction
            if (inputFromCurrentAddress) {
                // This address is spending funds
                if (totalOutputToOthers > 0) {
                    // Handle case where we're sending to multiple recipients
                    if (outputsToOthers.length > 1) {
                        // For multi-recipient transactions, use the largest output as the "primary" recipient
                        let largestOutput = outputsToOthers[0];
                        for (const output of outputsToOthers) {
                            if (output.value > largestOutput.value) {
                                largestOutput = output;
                            }
                        }

                        return {
                            type: 'send',
                            amount: totalOutputToOthers, // Show total amount sent to all recipients
                            fromAddress: address,
                            toAddress: largestOutput.address, // Use the largest recipient as the primary one
                        };
                    } else {
                        // Standard send transaction (may also have change)
                        return {
                            type: 'send',
                            amount: totalOutputToOthers,
                            fromAddress: address,
                            toAddress: firstOutputToOthers || 'Unknown',
                        };
                    }
                } else if (hasOutputToCurrentAddress) {
                    // This is a self-transfer (consolidation to the same wallet)
                    return {
                        type: 'receive', // We display self-transfers as receives
                        amount: totalOutputToCurrentAddress,
                        fromAddress: address, // It's from ourselves
                        toAddress: address, // To ourselves
                    };
                } else if (fee > 0 && totalOutputValue === 0) {
                    // This might be a burn transaction or fee-only transaction
                    return {
                        type: 'send',
                        amount: fee, // Use the fee as the amount
                        fromAddress: address,
                        toAddress: 'Fee/Burn',
                    };
                }
            } else if (hasOutputToCurrentAddress) {
                // This is a receive transaction to this address
                const senderAddress =
                    inputAddresses.length > 0 ? inputAddresses[0] : this.getSenderAddress(txDetails);
                return {
                    type: 'receive',
                    amount: totalOutputToCurrentAddress,
                    fromAddress: senderAddress,
                    toAddress: address,
                };
            }

            // Transaction doesn't involve our address meaningfully
            return null;
        } catch (error) {
            walletLogger.error('Error classifying transaction:', error);
            return null;
        }
    }

    // Custom DER encoding method that supports Avian's fork ID
    private encodeDERWithCustomHashType(signature: Buffer, hashType: number): Buffer {
        // If signature is 64 bytes (r + s), convert to DER format
        if (signature.length === 64) {
            const r = signature.subarray(0, 32);
            const s = signature.subarray(32, 64);

            // Create DER encoded signature
            const derSig = this.toDERFormat(r, s);

            // Append hash type (this bypasses bitcoinjs-lib validation)
            // Ensure hashType is 0x41 (SIGHASH_ALL | SIGHASH_FORKID) for Avian network
            const result = Buffer.concat([derSig, Buffer.from([hashType & 0xff])]);
            return result;
        } else {
            // If it's already DER encoded, just append hash type
            const result = Buffer.concat([signature, Buffer.from([hashType & 0xff])]);
            return result;
        }
    }

    private toDERFormat(r: Buffer, s: Buffer): Buffer {
        const rClean = this.removeLeadingZeros(r);
        const sClean = this.removeLeadingZeros(s);

        // If first byte is >= 0x80, prepend 0x00 to indicate positive number
        const rWithPadding = rClean[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), rClean]) : rClean;
        const sWithPadding = sClean[0] >= 0x80 ? Buffer.concat([Buffer.from([0x00]), sClean]) : sClean;

        // Build DER structure: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
        const rPart = Buffer.concat([Buffer.from([0x02, rWithPadding.length]), rWithPadding]);
        const sPart = Buffer.concat([Buffer.from([0x02, sWithPadding.length]), sWithPadding]);

        const content = Buffer.concat([rPart, sPart]);
        return Buffer.concat([Buffer.from([0x30, content.length]), content]);
    }

    private removeLeadingZeros(buffer: Buffer): Buffer {
        let start = 0;
        while (start < buffer.length - 1 && buffer[start] === 0) {
            start++;
        }
        return buffer.subarray(start);
    }

    private async isOurAddress(address: string): Promise<boolean> {
        try {
            const wallets = await StorageService.getAllWallets();
            return wallets.some((wallet: WalletData) => wallet.address === address);
        } catch (error) {
            walletLogger.error('Error checking if address belongs to our wallets:', error);
            return false;
        }
    }

    /**
     * Clean up misclassified transactions in the database.
     * This removes "receive" transactions that are actually change outputs from our own sent transactions.
     */
    async cleanupMisclassifiedTransactions(address?: string): Promise<number> {
        try {
            let targetAddress = address;
            if (!targetAddress) {
                const activeWallet = await this.getActiveWallet();
                if (!activeWallet) {
                    walletLogger.warn('No active wallet found for cleanup');
                    return 0;
                }
                targetAddress = activeWallet.address;
            }

            const existingTxs = await StorageService.getTransactionHistory(targetAddress);
            const sentTxIds = new Set(
                existingTxs.filter((tx) => tx.type === 'send').map((tx) => tx.txid),
            );

            // Find received transactions that are actually change from sent transactions
            const misclassifiedTxs = existingTxs.filter(
                (tx) => tx.type === 'receive' && sentTxIds.has(tx.txid),
            );

            // Remove misclassified transactions
            for (const tx of misclassifiedTxs) {
                await StorageService.removeTransaction(tx.txid, targetAddress);
            }

            return misclassifiedTxs.length;
        } catch (error) {
            walletLogger.error('Error cleaning up misclassified transactions:', error);
            return 0;
        }
    }

    /**
     * Reprocess transaction history for an address
     * @param address - Optional wallet address, will use active wallet if not provided
     * @param onProgress - Optional progress callback (currently unused in implementation)
     * @param onBalanceUpdate - Optional balance update callback (currently unused in implementation)
     * @returns The number of transactions updated
     */
    async reprocessTransactionHistory(
        address?: string,
        onProgress?: (processed: number, total: number, currentTx?: string) => void,
        onBalanceUpdate?: (newBalance: number) => void,
    ): Promise<number> {
        try {
            // If no address provided, use the active wallet's address
            if (!address) {
                const activeWallet = await this.getActiveWallet();
                if (activeWallet) {
                    address = activeWallet.address;
                }
            }

            if (!address) {
                walletLogger.warn('No address available to reprocess transaction history');
                return 0;
            }

            // Get transaction history from ElectrumX
            const txHistory = await this.electrum.getTransactionHistory(address);

            if (!txHistory || txHistory.length === 0) {
                return 0;
            }

            // Get existing transactions from local storage
            const existingTxs = await StorageService.getTransactionHistory(address);
            const existingTxMap = new Map(existingTxs.map((tx) => [tx.txid, tx]));

            let updatedCount = 0;
            let processedCount = 0;
            const total = txHistory.length;

            // Report initial progress
            onProgress?.(processedCount, total);

            // Process each transaction from history
            for (const historyTx of txHistory) {
                try {
                    // Get detailed transaction data
                    const txDetails = await this.electrum.getTransaction(historyTx.tx_hash, true);

                    if (!txDetails) {
                        continue;
                    }

                    // Reclassify the transaction
                    const classification = await this.classifyTransaction(txDetails, address);
                    if (!classification) {
                        continue;
                    }

                    // Calculate proper confirmations
                    const confirmations = await this.calculateConfirmations(historyTx.height);

                    // Create the updated transaction object
                    const updatedTx = {
                        txid: historyTx.tx_hash,
                        amount: classification.amount / 100000000, // Convert satoshis to AVN
                        address: classification.toAddress,
                        fromAddress: classification.fromAddress,
                        walletAddress: address, // Add wallet address for proper multi-wallet support
                        type: classification.type,
                        timestamp: new Date(txDetails.time ? txDetails.time * 1000 : Date.now()),
                        confirmations: confirmations,
                        blockHeight: historyTx.height || undefined,
                    };

                    // Check if this transaction exists and needs updating
                    const existingTx = existingTxMap.get(historyTx.tx_hash);

                    if (existingTx) {
                        // Check if any fields need updating
                        const needsUpdate =
                            existingTx.type !== updatedTx.type ||
                            existingTx.amount !== updatedTx.amount ||
                            existingTx.address !== updatedTx.address ||
                            existingTx.fromAddress !== updatedTx.fromAddress;

                        if (needsUpdate) {
                            // Update the transaction
                            await StorageService.saveTransaction(updatedTx);
                            updatedCount++;
                        }
                    } else {
                        // This is a new transaction, save it
                        await StorageService.saveTransaction(updatedTx);
                        updatedCount++;
                    }

                    // Update balance periodically
                    if ((processedCount % 5 === 0 || processedCount === total - 1) && onBalanceUpdate) {
                        const currentBalance = await this.getBalance(address);
                        onBalanceUpdate(currentBalance);
                    }

                    processedCount++;
                    onProgress?.(processedCount, total, historyTx.tx_hash);
                } catch (error) {
                    walletLogger.error(`Error reprocessing transaction ${historyTx.tx_hash}:`, error);
                    processedCount++;
                    onProgress?.(processedCount, total, historyTx.tx_hash);
                }
            } // Report final progress
            onProgress?.(processedCount, total);

            // Final balance update
            if (onBalanceUpdate) {
                const finalBalance = await this.getBalance(address);
                onBalanceUpdate(finalBalance);
            }

            return updatedCount;
        } catch (error) {
            walletLogger.error('Error reprocessing transaction history:', error);
            return 0;
        }
    }

    /**
     * Progressively reprocesses transaction history for an address one transaction at a time,
     * allowing for more interactive UI updates.
     *
     * @param address The wallet address to reprocess transactions for
     * @param onProgress Callback to report progress and new transaction data
     * @param onBalanceUpdate Optional callback to report balance updates
     * @returns The number of transactions that were processed
     */
    async reprocessTransactionHistoryProgressive(
        address?: string,
        onProgress?: (
            processed: number,
            total: number,
            currentTx?: string,
            newTransaction?: any,
        ) => void,
        onBalanceUpdate?: (newBalance: number) => void,
    ): Promise<number> {
        try {
            // If no address provided, use the active wallet's address
            if (!address) {
                const activeWallet = await this.getActiveWallet();
                if (activeWallet) {
                    address = activeWallet.address;
                }
            }

            if (!address) {
                walletLogger.warn('No address available to reprocess transaction history');
                return 0;
            }

            // Get transaction history from ElectrumX
            const txHistory = await this.electrum.getTransactionHistory(address);

            if (!txHistory || txHistory.length === 0) {
                return 0;
            }

            // Get existing transactions from local storage
            const existingTxs = await StorageService.getTransactionHistory(address);
            const existingTxMap = new Map(existingTxs.map((tx) => [`${tx.txid}-${tx.type}`, tx]));

            let processedCount = 0;
            const total = txHistory.length;

            // Report initial progress
            onProgress?.(processedCount, total);

            // Process each transaction one at a time
            for (const historyTx of txHistory) {
                try {
                    // Get detailed transaction data
                    const txDetails = await this.electrum.getTransaction(historyTx.tx_hash, true);
                    if (!txDetails) {
                        processedCount++;
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                        continue;
                    }

                    // Reclassify the transaction
                    const classification = await this.classifyTransaction(txDetails, address);
                    if (!classification) {
                        processedCount++;
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                        continue;
                    }

                    // Calculate proper confirmations
                    const confirmations = await this.calculateConfirmations(historyTx.height);

                    // Create the updated transaction object
                    const updatedTx = {
                        txid: historyTx.tx_hash,
                        amount: classification.amount / 100000000, // Convert satoshis to AVN
                        address: classification.toAddress,
                        fromAddress: classification.fromAddress,
                        walletAddress: address, // Add wallet address for proper multi-wallet support
                        type: classification.type,
                        timestamp: new Date(txDetails.time ? txDetails.time * 1000 : Date.now()),
                        confirmations: confirmations,
                        blockHeight: historyTx.height || undefined,
                    };

                    // Check if this transaction exists and needs updating
                    const existingTx = existingTxMap.get(`${historyTx.tx_hash}-${classification.type}`);
                    let isUpdated = false;

                    if (existingTx) {
                        // Check if any fields need updating
                        const needsUpdate =
                            existingTx.type !== updatedTx.type ||
                            existingTx.amount !== updatedTx.amount ||
                            existingTx.address !== updatedTx.address ||
                            existingTx.fromAddress !== updatedTx.fromAddress ||
                            existingTx.confirmations !== updatedTx.confirmations ||
                            !existingTx.walletAddress; // Always update if walletAddress is missing

                        if (needsUpdate) {
                            // Update the transaction with existing ID
                            const txWithId = { ...updatedTx } as any;
                            txWithId.id = existingTx.id;
                            await StorageService.saveTransaction(txWithId);
                            isUpdated = true;
                        }
                    } else {
                        // This is a new transaction, save it
                        await StorageService.saveTransaction(updatedTx);
                        isUpdated = true;
                    }

                    // For self-transfers, also check and update the opposite transaction type
                    const oppositeType = classification.type === 'send' ? 'receive' : 'send';
                    const existingOppositeTx = existingTxMap.get(`${historyTx.tx_hash}-${oppositeType}`);

                    if (existingOppositeTx) {
                        // Check if this is a self-transfer by comparing addresses
                        const isSelfTransfer =
                            (classification.type === 'send' &&
                                existingOppositeTx.type === 'receive' &&
                                existingOppositeTx.fromAddress === classification.toAddress) ||
                            (classification.type === 'receive' &&
                                existingOppositeTx.type === 'send' &&
                                existingOppositeTx.address === classification.fromAddress);

                        if (isSelfTransfer) {
                            // Update the opposite transaction's confirmations to match
                            const needsOppositeUpdate = existingOppositeTx.confirmations !== confirmations;

                            if (needsOppositeUpdate) {
                                const oppositeUpdatedTx = {
                                    ...existingOppositeTx,
                                    confirmations: confirmations,
                                    blockHeight: historyTx.height || existingOppositeTx.blockHeight,
                                };

                                await StorageService.saveTransaction(oppositeUpdatedTx);
                                isUpdated = true;
                            }
                        }
                    }

                    // Update balance periodically
                    if ((processedCount % 5 === 0 || processedCount === total - 1) && onBalanceUpdate) {
                        const currentBalance = await this.getBalance(address);
                        onBalanceUpdate(currentBalance);
                    }

                    processedCount++;

                    // Call progress callback with transaction data if it was updated
                    if (isUpdated) {
                        onProgress?.(processedCount, total, historyTx.tx_hash, updatedTx);
                    } else {
                        onProgress?.(processedCount, total, historyTx.tx_hash);
                    }
                } catch (error) {
                    walletLogger.error(`Error reprocessing transaction ${historyTx.tx_hash}:`, error);
                    processedCount++;
                    onProgress?.(processedCount, total, historyTx.tx_hash);
                }

                // Small delay to allow UI to update
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Final balance update
            if (onBalanceUpdate) {
                const finalBalance = await this.getBalance(address);
                onBalanceUpdate(finalBalance);
            }

            // Report final progress
            onProgress?.(processedCount, total);

            return processedCount;
        } catch (error) {
            walletLogger.error('Error progressively reprocessing transaction history:', error);
            return 0;
        }
    }

    /**
     * Derives multiple addresses from a given mnemonic phrase and checks their balances
     * Static method that can be used without an initialized wallet
     */
    static async deriveAddressesWithBalances(
        mnemonic: string,
        passphrase?: string,
        accountIndex: number = 0,
        addressCount: number = 10,
        addressType: string = 'p2pkh',
        changePath: number = 0, // 0 for receiving addresses, 1 for change addresses
        coinType: number = 921, // 921 for Avian, 175 for Ravencoin compatibility
    ): Promise<Array<{ path: string; address: string; balance: number; hasTransactions: boolean }>> {
        // Validate mnemonic
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid BIP39 mnemonic phrase');
        }

        try {
            // Create ElectrumService instance for balance checking
            const electrum = new ElectrumService();

            // Connect to Electrum server if not already connected
            if (!electrum.isConnectedToServer()) {
                await electrum.connect();
            }

            // Derive seed from mnemonic with optional passphrase (BIP39 25th word)
            const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');

            // Create HD wallet root
            const root = bip32.fromSeed(seed, avianNetwork);

            // Array to store derived addresses with balances
            const derivedAddresses: Array<{
                path: string;
                address: string;
                balance: number;
                hasTransactions: boolean;
            }> = [];

            // Generate addresses based on the selected address type
            for (let i = 0; i < addressCount; i++) {
                // Derive path - m/44'/coinType'/accountIndex'/changePath/i
                // coinType: 921 for Avian, 175 for Ravencoin compatibility
                const path = `m/44'/${coinType}'/${accountIndex}'/${changePath}/${i}`;
                const child = root.derivePath(path);

                if (!child.privateKey) {
                    throw new Error(`Failed to derive private key for path ${path}`);
                }

                // Create ECPair from derived private key
                const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });

                // Get the address based on address type
                let address: string | undefined;

                if (addressType === 'p2pkh') {
                    // Standard P2PKH address
                    const p2pkh = bitcoin.payments.p2pkh({
                        pubkey: Buffer.from(keyPair.publicKey),
                        network: avianNetwork,
                    });
                    address = p2pkh.address;
                } else {
                    // Default to P2PKH if type is not recognized
                    const p2pkh = bitcoin.payments.p2pkh({
                        pubkey: Buffer.from(keyPair.publicKey),
                        network: avianNetwork,
                    });
                    address = p2pkh.address;
                }

                if (!address) {
                    throw new Error(`Failed to generate address for path ${path}`);
                }

                // Check balance for the address
                const balance = await electrum.getBalance(address);

                // Check if the address has any transactions
                const history = await electrum.getTransactionHistory(address);
                const hasTransactions = history.length > 0;

                // Add derived address with balance to the array
                derivedAddresses.push({
                    path,
                    address,
                    balance,
                    hasTransactions,
                });
            }

            return derivedAddresses;
        } catch (error) {
            walletLogger.error('Error deriving addresses with balances:', error);
            throw new Error('Failed to derive addresses with balances');
        }
    }

    /**
     * Derives multiple addresses from the current wallet's mnemonic phrase and checks their balances
     * Requires wallet password to decrypt the mnemonic
     */
    async deriveCurrentWalletAddresses(
        password: string,
        accountIndex: number = 0,
        addressCount: number = 10,
        addressType: string = 'p2pkh',
        changePath: number = 0, // 0 for receiving addresses, 1 for change addresses
    ): Promise<Array<{ path: string; address: string; balance: number; hasTransactions: boolean }>> {
        try {
            // Get the current wallet to retrieve its coin type
            const activeWallet = await StorageService.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }

            // Use the wallet's stored coin type, defaulting to 921 for legacy wallets
            const coinType = activeWallet.coinType || 921;

            const storedMnemonic = await StorageService.getMnemonic();
            if (!storedMnemonic) {
                throw new Error('No mnemonic stored for this wallet. Address derivation is not available.');
            }

            const isEncrypted = await StorageService.getIsEncrypted();
            let decryptedMnemonic: string;

            if (isEncrypted) {
                try {
                    const { decrypted } = await decryptData(storedMnemonic, password);
                    decryptedMnemonic = decrypted;
                    if (!decryptedMnemonic) {
                        throw new Error('Failed to decrypt mnemonic');
                    }

                    // Validate the decrypted mnemonic
                    if (!bip39.validateMnemonic(decryptedMnemonic)) {
                        throw new Error('Decrypted mnemonic is invalid');
                    }
                } catch (error) {
                    throw new Error('Invalid password or corrupted mnemonic');
                }
            } else {
                decryptedMnemonic = storedMnemonic;
            }

            // Decrypt the stored passphrase if it exists
            let decryptedPassphrase: string | undefined;
            if (activeWallet.bip39Passphrase && isEncrypted) {
                try {
                    const { decrypted } = await decryptData(activeWallet.bip39Passphrase, password);
                    decryptedPassphrase = decrypted;
                } catch (error) {
                    throw new Error('Invalid password or corrupted passphrase');
                }
            } else if (activeWallet.bip39Passphrase && !isEncrypted) {
                // If wallet is not encrypted but has a passphrase, use it directly
                decryptedPassphrase = activeWallet.bip39Passphrase;
            }

            // Use the static method to derive addresses
            return WalletService.deriveAddressesWithBalances(
                decryptedMnemonic,
                decryptedPassphrase, // Use the decrypted passphrase from wallet
                accountIndex,
                addressCount,
                addressType,
                changePath,
                coinType,
            );
        } catch (error) {
            walletLogger.error('Error deriving addresses from current wallet:', error);
            throw error;
        }
    }
    /**
     * Sign a message with the private key of the given wallet address
     * @param privateKeyWIF - The WIF private key to sign the message with (may be encrypted)
     * @param message - The message to sign
     * @param password - Optional password for decrypting an encrypted private key
     * @returns The signature as a base64 string
     */
    async signMessage(privateKeyWIF: string, message: string, password?: string): Promise<string> {
        try {
            let decryptedKey = privateKeyWIF;

            // Helper function to check if a string is a valid WIF private key
            const isValidWIF = (key: string): boolean => {
                try {
                    // WIF keys should be base58 encoded and start with specific characters
                    // For Avian network, they typically start with 'K', 'L', or '5'
                    if (!/^[5KL][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(key)) {
                        return false;
                    }

                    // Try to create ECPair to validate
                    const ECPair = ECPairFactory(ecc);
                    ECPair.fromWIF(key, avianNetwork);
                    return true;
                } catch {
                    return false;
                }
            };

            // Check if the private key is encrypted by trying to parse it as WIF first
            if (!isValidWIF(privateKeyWIF)) {
                // This doesn't look like a valid WIF key, it's likely encrypted
                if (!password) {
                    throw new Error('This private key is encrypted. Password is required for signing.');
                }

                try {
                    // Attempt to decrypt with the provided password
                    const { decrypted } = await decryptData(privateKeyWIF, password);
                    decryptedKey = decrypted;
                    if (!decryptedKey) {
                        throw new Error('Failed to decrypt private key');
                    }

                    // Validate the decrypted key is a valid WIF
                    if (!isValidWIF(decryptedKey)) {
                        throw new Error('Decrypted data is not a valid WIF private key');
                    }
                } catch (decryptError) {
                    walletLogger.error('Error decrypting private key:', decryptError);
                    throw new Error('Invalid password or corrupted private key');
                }
            }

            // Now use the (potentially decrypted) key to create the ECPair
            const ECPair = ECPairFactory(ecc);
            const keyPair = ECPair.fromWIF(decryptedKey, avianNetwork);

            if (!keyPair.privateKey) {
                throw new Error('Private key is undefined');
            }

            // Sign the message
            const signature = bitcoinMessage.sign(
                message,
                Buffer.from(keyPair.privateKey),
                keyPair.compressed,
                avianNetwork.messagePrefix,
            );

            // Base64-encode for transport/storage
            const signatureB64 = signature.toString('base64');

            return signatureB64;
        } catch (error) {
            walletLogger.error('Failed to sign message:', error);
            throw new Error(
                `Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /**
     * Verify a signed message
     * @param address - The Avian address that supposedly signed the message
     * @param message - The original message
     * @param signature - The signature as a base64 string
     * @returns True if the signature is valid, false otherwise
     */
    async verifyMessage(
        address: string,
        message: string,
        signature: string,
        returnPublicKey: boolean = false,
    ): Promise<boolean | { isValid: boolean; publicKey?: string }> {
        try {
            const isValid = bitcoinMessage.verify(
                message,
                address,
                signature,
                avianNetwork.messagePrefix, // Use the network's message prefix
                false,
            );

            if (returnPublicKey && isValid) {
                try {
                    // Recover the public key from the message and signature
                    const recoveredPubKeyRaw = recoverPubKey(message, signature);

                    if (recoveredPubKeyRaw === null) {
                        return { isValid: true }; // Public key couldn't be retrieved
                    }

                    // Convert to hex format
                    const publicKey = Buffer.from(recoveredPubKeyRaw).toString('hex');

                    // You can optionally validate here if this matches your expected public key
                    // by comparing it with a known key from your wallet

                    return {
                        isValid: true,
                        publicKey,
                    };
                } catch (pubKeyError) {
                    walletLogger.error('Failed to get public key for address:', pubKeyError);
                    return { isValid: true };
                }
            }

            return returnPublicKey ? { isValid } : isValid;
        } catch (error) {
            walletLogger.error('Failed to verify message:', error);
            return returnPublicKey ? { isValid: false } : false;
        }
    }

    /**
     * Encrypt a message for a specific public key
     * @param recipientPublicKey - The recipient's public key in hex format
     * @param message - The message to encrypt
     * @returns The encrypted message as a base64 string
     */
    async encryptMessage(recipientPublicKey: string, message: string): Promise<string> {
        try {
            // Use the public key directly
            const P = Buffer.from(recipientPublicKey, 'hex');
            const r = randomBytes(32); // ephemeral priv
            const R = ecc.pointFromScalar(r, true)!; // 33-byte ephemeral pub
            // Ensure r is treated as a regular Uint8Array for pointMultiply
            const S = ecc.pointMultiply(P, Buffer.from(r))!; // ECDH shared
            const sharedPoint = Buffer.from(S); // Convert to Buffer for consistent handling

            // KDF: SHA-512(S)
            const K = createHash('sha512').update(sharedPoint).digest();
            const iv = K.subarray(0, 16); // 16-byte IV
            const keyE = K.subarray(16, 32); // 16-byte AES key (AES-128)
            const keyM = K.subarray(32); // remaining 32 bytes for HMAC

            // AES-128-CBC
            const cipher = createCipheriv('aes-128-cbc', keyE, iv);
            const C = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);

            // Create the entire message without MAC
            const messageWithoutMac = Buffer.concat([ECIES_PREFIX, R, C]);

            // HMAC-SHA256 over the entire message without MAC
            const mac = createHmac('sha256', keyM).update(messageWithoutMac).digest();

            // Final envelope: magic ∥ R ∥ C ∥ mac, base64-encoded
            return Buffer.concat([messageWithoutMac, mac]).toString('base64');
        } catch (error) {
            walletLogger.error('Failed to encrypt message:', error);
            throw error;
        }
    }

    /**
     * Decrypt a message that was encrypted for you
     * @param recipientPrivateKeyWIF - The recipient's private key in WIF format (may be encrypted)
     * @param encryptedMessage - The encrypted message to decrypt
     * @param password - Optional password for decrypting an encrypted private key
     * @returns The decrypted message
     */
    async decryptMessage(
        recipientPrivateKeyWIF: string,
        encryptedMessage: string,
        password?: string,
    ): Promise<string> {
        try {
            // First, decrypt the recipient's private key if necessary
            let decryptedKey = recipientPrivateKeyWIF;

            // Helper function to check if a string is a valid WIF private key
            const isValidWIF = (key: string): boolean => {
                try {
                    // WIF keys should be base58 encoded and start with specific characters
                    // For Avian network, they typically start with 'K', 'L', or '5'
                    if (!/^[5KL][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(key)) {
                        return false;
                    }

                    // Try to create ECPair to validate
                    const ECPair = ECPairFactory(ecc);
                    ECPair.fromWIF(key, avianNetwork);
                    return true;
                } catch {
                    return false;
                }
            };

            // Check if the private key is encrypted by trying to parse it as WIF first
            if (!isValidWIF(recipientPrivateKeyWIF)) {
                // This doesn't look like a valid WIF key, it's likely encrypted
                if (!password) {
                    throw new Error('This private key is encrypted. Password is required for decryption.');
                }

                try {
                    // Attempt to decrypt with the provided password
                    const { decrypted } = await decryptData(recipientPrivateKeyWIF, password);
                    decryptedKey = decrypted;
                    if (!decryptedKey) {
                        throw new Error('Failed to decrypt private key');
                    }

                    // Validate the decrypted key is a valid WIF
                    if (!isValidWIF(decryptedKey)) {
                        throw new Error('Decrypted data is not a valid WIF private key');
                    }
                } catch (decryptError) {
                    walletLogger.error('Error decrypting private key:', decryptError);
                    throw new Error('Invalid password or corrupted private key');
                }
            }

            // Debug: show base64 input
            const buf = Buffer.from(encryptedMessage, 'base64');

            // Verify the message has the correct prefix
            if (!buf.subarray(0, 4).equals(ECIES_PREFIX)) throw new Error('Bad prefix');

            // Verify minimal required length
            const minLength = 4 + 33 + 16 + 32; // prefix + R + minimum ciphertext + MAC
            if (buf.length < minLength) {
                throw new Error(
                    `Message too short (${buf.length} bytes), minimum required length is ${minLength} bytes`,
                );
            }

            // Extract the ephemeral public key R from the encrypted message
            // First 4 bytes are the magic bytes (format identifier) - skipping as not needed
            const R = buf.subarray(4, 4 + 33); // next 33 bytes
            const cipherTextWithMac = buf.subarray(4 + 33); // C ∥ mac
            const mac = cipherTextWithMac.subarray(cipherTextWithMac.length - 32); // last 32 bytes
            const C = cipherTextWithMac.subarray(0, cipherTextWithMac.length - 32); // the ciphertext

            // ECDH using the ephemeral public key R and recipient's private key
            const ECPair = ECPairFactory(ecc);
            const recipientKeyPair = ECPair.fromWIF(decryptedKey, avianNetwork);
            if (!recipientKeyPair.privateKey) {
                throw new Error('Private key is undefined');
            }

            const d = recipientKeyPair.privateKey;
            // Ensure private key is treated as a regular Uint8Array for pointMultiply
            const privateKeyBytes = Buffer.from(d);
            const S = ecc.pointMultiply(R, privateKeyBytes)!;
            const sharedPoint = Buffer.from(S);

            // KDF: SHA-512(S)
            const K = createHash('sha512').update(sharedPoint).digest();
            const iv = Buffer.alloc(16);
            K.copy(iv, 0, 0, 16);
            const keyE = K.subarray(16, 32); // 16-byte AES key (AES-128)
            const keyM = K.subarray(32); // remaining 32 bytes for HMAC

            // verify HMAC - reconstruct the same data that was used in encryption
            // HMAC is calculated over the entire message except the MAC itself
            const preMac = buf.subarray(0, buf.length - 32); // All data up to but not including the MAC
            const mac2 = createHmac('sha256', keyM).update(preMac).digest();

            // Compare MACs
            if (!mac.equals(mac2)) {
                throw new Error('MAC mismatch');
            }

            // decrypt AES-128-CBC
            const decipher = createDecipheriv('aes-128-cbc', keyE, iv);
            const pt = Buffer.concat([decipher.update(C), decipher.final()]);
            return pt.toString('utf8');
        } catch (error) {
            walletLogger.error('Failed to decrypt message:', error);
            throw error;
        }
    }

    /**
     * Send a transaction from a specific derived address
     * @param toAddress - The recipient's address
     * @param amount - Amount to send in satoshis
     * @param password - The wallet's encryption password
     * @param derivationPath - The BIP32 derivation path (e.g., "m/44'/921'/0'/0/1")
     * @param options - Optional settings for transaction creation
     * @returns Transaction ID
     */
    async sendFromDerivedAddress(
        toAddress: string,
        amount: number,
        password: string,
        derivationPath: string,
        options?: {
            strategy?: CoinSelectionStrategy;
            feeRate?: number;
            maxInputs?: number;
            minConfirmations?: number;
            changeAddress?: string; // Custom change address for HD wallets
            subtractFeeFromAmount?: boolean; // Whether to subtract fee from the send amount
        },
    ): Promise<string> {
        try {
            // Get current wallet data
            const activeWallet = await StorageService.getActiveWallet();
            if (!activeWallet) {
                throw new Error('No active wallet found');
            }

            // Check if wallet has a mnemonic (required for derivation)
            const storedMnemonic = await StorageService.getMnemonic();
            if (!storedMnemonic) {
                throw new Error('No mnemonic stored for this wallet. HD functionality is not available.');
            }

            // Decrypt mnemonic if encrypted
            let decryptedMnemonic: string;
            if (activeWallet.isEncrypted) {
                try {
                    const { decrypted } = await decryptData(storedMnemonic, password);
                    decryptedMnemonic = decrypted;
                    if (!decryptedMnemonic) {
                        throw new Error('Invalid password');
                    }

                    // Validate the decrypted mnemonic
                    if (!bip39.validateMnemonic(decryptedMnemonic)) {
                        throw new Error('Invalid mnemonic');
                    }
                } catch (error) {
                    throw new Error('Invalid password or corrupted mnemonic');
                }
            } else {
                decryptedMnemonic = storedMnemonic;
            }

            // Derive the private key for the specified path
            const seed = await bip39.mnemonicToSeed(decryptedMnemonic);
            const root = bip32.fromSeed(seed, avianNetwork);

            // Remove 'm/' prefix if present in the path
            const cleanPath = derivationPath.startsWith('m/')
                ? derivationPath.substring(2)
                : derivationPath;

            const child = root.derivePath(cleanPath);

            if (!child.privateKey) {
                throw new Error(`Failed to derive private key for path ${derivationPath}`);
            }

            // Create ECPair from derived private key
            const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: avianNetwork });

            // Generate the address from the derived key
            const p2pkh = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(keyPair.publicKey),
                network: avianNetwork,
            });

            const fromAddress = p2pkh.address;
            if (!fromAddress) {
                throw new Error('Failed to generate address from derived key');
            }

            // Get UTXOs for the derived address
            const rawUTXOs = await this.electrum.getUTXOs(fromAddress);
            if (rawUTXOs.length === 0) {
                throw new Error('No unspent transaction outputs found for this derived address');
            }

            // Enhance UTXOs with additional metadata
            const currentBlockHeight = await this.electrum.getCurrentBlockHeight();
            const enhancedUTXOs: EnhancedUTXO[] = rawUTXOs.map((utxo) => ({
                ...utxo,
                confirmations: utxo.height ? Math.max(0, currentBlockHeight - utxo.height + 1) : 0,
                isConfirmed: utxo.height ? currentBlockHeight - utxo.height + 1 >= 1 : false,
                ageInBlocks: utxo.height ? currentBlockHeight - utxo.height + 1 : 0,
                address: fromAddress,
            }));

            // Calculate total available amount
            const totalAvailable = enhancedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);

            // Define transaction fee and options
            const feeRate = options?.feeRate || 10000; // Default to 10000 satoshis per KB
            const maxInputs = options?.maxInputs || 650; // Default: stay under ~100KB for standard txs
            const minConfirmations =
                options?.minConfirmations !== undefined ? options?.minConfirmations : 6;
            const strategy = options?.strategy || CoinSelectionStrategy.BEST_FIT;

            // Get selected UTXOs based on the chosen strategy
            const selectionOptions: UTXOSelectionOptions = {
                strategy: strategy,
                targetAmount: amount,
                feeRate: feeRate,
                maxInputs: maxInputs,
                minConfirmations: minConfirmations,
                allowUnconfirmed: true,
                includeDust: false,
            };

            const selectionResult = UTXOSelectionService.selectUTXOs(enhancedUTXOs, selectionOptions);

            if (!selectionResult) {
                throw new Error('Unable to select suitable UTXOs for transaction');
            }

            const { selectedUTXOs, change: changeAmount } = selectionResult;

            // Calculate final amounts based on subtractFeeFromAmount option
            let finalSendAmount = amount;
            let finalChangeAmount = changeAmount;

            if (options?.subtractFeeFromAmount) {
                // Subtract the estimated fee from the send amount
                const estimatedFee = (feeRate * 250) / 1000; // Rough estimate based on typical transaction size
                finalSendAmount = Math.max(0, amount - estimatedFee);
                // Recalculate change with the reduced send amount
                const totalInput = selectedUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
                finalChangeAmount = totalInput - finalSendAmount - estimatedFee;
            }

            // Determine change address - use custom address if provided, otherwise sender's address
            const changeAddress =
                options?.changeAddress && options.changeAddress.trim() !== ''
                    ? options.changeAddress
                    : fromAddress;

            // Create transaction
            const tx = new bitcoin.Transaction();

            // Add inputs from selected UTXOs
            for (const utxo of selectedUTXOs) {
                tx.addInput(Buffer.from(utxo.txid, 'hex').reverse(), utxo.vout);
            }

            // Add output for recipient
            tx.addOutput(bitcoin.address.toOutputScript(toAddress, avianNetwork), finalSendAmount);

            // Add change output if needed
            if (finalChangeAmount > 600) {
                // Only create change outputs above dust limit
                tx.addOutput(
                    bitcoin.address.toOutputScript(changeAddress, avianNetwork),
                    finalChangeAmount,
                );
            }

            // Sign the transaction inputs
            for (let i = 0; i < tx.ins.length; i++) {
                try {
                    // Get the previous transaction to use the correct scriptPubKey
                    const utxo = selectedUTXOs[i];
                    const prevTxHex = await this.electrum.getTransaction(utxo.txid, false);
                    const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
                    const prevOutScript = prevTx.outs[utxo.vout].script;

                    // Define hashType consistent with the sendTransaction method
                    const SIGHASH_ALL = 0x01;
                    const SIGHASH_FORKID = 0x40;
                    const hashType = SIGHASH_ALL | SIGHASH_FORKID; // 0x41 for Avian

                    // Create the signature hash using hashForSignature instead of hashForWitnessV0
                    // This is the correct method for P2PKH addresses
                    const signatureHash = tx.hashForSignature(i, prevOutScript, hashType);

                    // Sign the hash
                    const signature = keyPair.sign(signatureHash);

                    // Encode signature in DER format with custom hashtype
                    const signatureWithHashType = this.encodeDERWithCustomHashType(
                        Buffer.from(signature),
                        hashType,
                    );

                    // Build scriptSig manually (matches what's used in sendTransaction)
                    const scriptSig = bitcoin.script.compile([
                        signatureWithHashType,
                        Buffer.from(keyPair.publicKey),
                    ]);

                    // Set the input script
                    tx.ins[i].script = scriptSig;
                } catch (error: any) {
                    walletLogger.error(`Error signing input ${i}:`, error);
                    throw new Error(`Failed to sign input ${i}: ${error.message || 'Unknown error'}`);
                }
            }

            // Validate the transaction before broadcasting
            for (let i = 0; i < tx.ins.length; i++) {
                if (!tx.ins[i].script || tx.ins[i].script.length === 0) {
                    throw new Error(`Input ${i} has empty script after signing!`);
                }
            }

            // Broadcast the transaction
            const serializedTx = tx.toHex();
            const txId = await this.electrum.broadcastTransaction(serializedTx);

            if (!txId) {
                throw new Error('Failed to broadcast transaction');
            }

            // Track this as a sent transaction in our history
            const txData = {
                txid: txId,
                amount: amount / 100000000, // Convert to AVN
                address: toAddress,
                fromAddress: fromAddress,
                walletAddress: fromAddress, // Use the derived address
                type: 'send' as 'send', // Explicitly typed as 'send'
                timestamp: new Date(),
                confirmations: 0,
            };

            // Save transaction to history
            await StorageService.saveTransaction(txData);

            return txId;
        } catch (error) {
            walletLogger.error('Error sending transaction from derived address:', error);
            throw error;
        }
    }
}
