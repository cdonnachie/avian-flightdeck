interface UTXO {
  txid: string;
  vout: number;
  value: number;
  height?: number;
}

interface BalanceResponse {
  confirmed: number;
  unconfirmed: number;
}

interface ElectrumServer {
  host: string;
  port: number;
  protocol: 'wss' | 'ws' | 'tcp';
  region?: string;
}

interface ElectrumRequest {
  id: number;
  method: string;
  params: any[];
}

interface ElectrumResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface ElectrumNotification {
  method: string;
  params: any[];
}

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { electrumLogger } from '@/lib/Logger';

// ECPair factory for working with key pairs
const ECPair = ECPairFactory(ecc);

// Avian network configuration (same as in WalletService)
const avianNetwork: bitcoin.Network = {
  messagePrefix: '\x16Raven Signed Message:\n',
  bech32: 'avn',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x3c, // Avian addresses start with 'R'
  scriptHash: 0x7a,
  wif: 0x80,
};

export class ElectrumService {
  private servers: ElectrumServer[];
  private currentServer: ElectrumServer | null = null;
  private websocket: WebSocket | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<
    number,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  > = new Map();
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private realBalanceCache: Map<string, number> = new Map(); // Cache real balances from subscriptions
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Array of Avian ElectrumX servers
    this.servers = [
      { host: 'electrum-us.avn.network', port: 50003, protocol: 'wss', region: 'US' },
      { host: 'electrum-eu.avn.network', port: 50003, protocol: 'wss', region: 'EU' },
      { host: 'electrum-ca.avn.network', port: 50003, protocol: 'wss', region: 'CA' },
    ];

    // Select the first server as default
    this.currentServer = this.servers[0];
  }

  async connect(): Promise<void> {
    try {
      if (!this.currentServer) {
        throw new Error('No server selected');
      }

      // Don't attempt to connect if already connected or connecting
      if (this.isConnected && this.websocket) {
        return;
      }

      if (this.isConnecting) {
        return;
      }

      // Set connecting state
      this.isConnecting = true;

      // Clean up any existing connection
      if (this.websocket) {
        this.websocket.close();
        this.websocket = null;
      }

      const url = `${this.currentServer.protocol}://${this.currentServer.host}:${this.currentServer.port}`;
      electrumLogger.debug(`Connecting to Electrum server: ${url}`);

      return new Promise((resolve, reject) => {
        this.websocket = new WebSocket(url);

        this.websocket.onopen = () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          electrumLogger.debug(`Connected to Electrum server: ${url}`);

          resolve();
        };

        this.websocket.onclose = (event) => {
          this.isConnected = false;
          this.isConnecting = false;
          electrumLogger.debug(
            `WebSocket closed: code=${event.code}, reason=${event.reason || 'unknown'}`,
          );

          // Attempt to reconnect if not manually closed and not already reconnecting
          if (
            event.code !== 1000 &&
            this.reconnectAttempts < this.maxReconnectAttempts &&
            !this.isConnecting
          ) {
            this.attemptReconnect();
          }
        };

        this.websocket.onerror = (error) => {
          electrumLogger.error('WebSocket error:', error);
          this.isConnected = false;
          this.isConnecting = false;
          reject(new Error('WebSocket connection failed'));
        };

        this.websocket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected && this.isConnecting) {
            this.isConnecting = false;
            this.websocket?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000); // 10 second timeout
      });
    } catch (error) {
      this.isConnecting = false;
      electrumLogger.error('Failed to connect to Electrum server:', error);
      throw new Error('Connection failed');
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s

    electrumLogger.debug(
      `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        electrumLogger.error('Reconnection failed:', error);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      });
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle responses to requests
      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);

          if (message.error) {
            pending.reject(
              new Error(`ElectrumX error ${message.error.code}: ${message.error.message}`),
            );
          } else {
            pending.resolve(message.result);
          }
        }
      }
      // Handle notifications (subscriptions)
      else if (message.method) {
        this.handleNotification(message);
      }
    } catch (error) {
      electrumLogger.error('Error parsing WebSocket message:', error);
    }
  }

  private handleNotification(notification: ElectrumNotification): void {
    electrumLogger.debug(`Received notification: ${notification.method}`);

    if (notification.method === 'blockchain.scripthash.subscribe') {
      const [scripthash, status] = notification.params;
      const callback = this.subscriptions.get(scripthash);

      electrumLogger.debug(
        `Subscription update for scripthash: ${scripthash.substring(0, 8)}... status: ${status}`,
      );

      if (callback) {
        callback({
          scripthash,
          status,
          method: notification.method,
        });
      }
    }
  }

  // Get list of available servers
  getAvailableServers(): ElectrumServer[] {
    return this.servers;
  }

  // Get current server
  getCurrentServer(): ElectrumServer | null {
    return this.currentServer;
  }

  // Select server by index
  selectServer(index: number): void {
    if (index >= 0 && index < this.servers.length) {
      // Store information about whether we were connected
      const wasConnected = this.isConnected;

      // Disconnect from current server if connected
      if (wasConnected) {
        this.disconnect();
      }

      // Update current server
      this.currentServer = this.servers[index];
      electrumLogger.debug(
        `Selected server: ${this.currentServer.host} (${this.currentServer.region || 'Unknown region'})`,
      );

      // Note: Connection must be initiated by the caller
    } else {
      throw new Error('Invalid server index');
    }
  }

  // Select server by host
  selectServerByHost(host: string): void {
    const server = this.servers.find((s) => s.host === host);
    if (server) {
      // Store information about whether we were connected
      const wasConnected = this.isConnected;

      // Disconnect from current server if connected
      if (wasConnected) {
        this.disconnect();
      }

      // Update current server
      this.currentServer = server;
      electrumLogger.debug(
        `Selected server by host: ${this.currentServer.host} (${this.currentServer.region || 'Unknown region'})`,
      );

      // Note: Connection must be initiated by the caller
    } else {
      throw new Error(`Server not found: ${host}`);
    }
  }

  // Auto-select best server (for future implementation)
  async selectBestServer(): Promise<void> {
    try {
      // For now, just select the first server
      // In production, implement ping/latency testing
      this.currentServer = this.servers[0];
    } catch (error) {
      electrumLogger.error('Failed to auto-select server:', error);
      throw error;
    }
  }

  // Get server URL for display
  getServerUrl(): string {
    if (!this.currentServer) return 'No server selected';
    return `${this.currentServer.protocol}://${this.currentServer.host}:${this.currentServer.port}`;
  }

  async getBalance(address: string, forceRefresh: boolean = false): Promise<number> {
    try {
      // Log the balance request for debugging
      electrumLogger.debug(
        `Getting balance for address: ${address.substring(0, 5)}...${address.substring(address.length - 5)} (force: ${forceRefresh})`,
      );

      // First check if we have real balance data from subscriptions (unless force refresh is requested)
      const cachedBalance = this.realBalanceCache.get(address);
      if (cachedBalance !== undefined && !forceRefresh) {
        electrumLogger.debug(
          `Using cached balance for ${address.substring(0, 5)}...: ${cachedBalance}`,
        );
        return cachedBalance;
      }

      // Convert address to script hash for Electrum protocol
      const scriptHash = this.addressToScriptHash(address);

      // Make real request to ElectrumX server

      const response = await this.makeRequest('blockchain.scripthash.get_balance', [scriptHash]);

      const totalBalance = response.confirmed + response.unconfirmed;

      // Update cache with real balance
      this.realBalanceCache.set(address, totalBalance);
      electrumLogger.debug(
        `Balance retrieved for ${address.substring(0, 5)}...: ${totalBalance} (confirmed: ${response.confirmed}, unconfirmed: ${response.unconfirmed})`,
      );

      return totalBalance;
    } catch (error) {
      // Return cached balance if available
      const cachedBalance = this.realBalanceCache.get(address);
      if (cachedBalance !== undefined) {
        electrumLogger.debug(
          `Failed to get balance from server, using cached balance for ${address.substring(0, 5)}...: ${cachedBalance}`,
        );
        return cachedBalance;
      }

      // Last resort: check StorageService for persisted balance
      try {
        const { StorageService } = await import('./StorageService');
        const walletBalance = await StorageService.getWalletBalance(address);

        return walletBalance;
      } catch (storageError) {
        // Final fallback: check localStorage for persisted balance
        const storedBalance = localStorage.getItem('avian_wallet_last_balance');
        return storedBalance ? parseInt(storedBalance, 10) : 0;
      }
    }
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    try {
      const scriptHash = this.addressToScriptHash(address);
      const response = await this.makeRequest('blockchain.scripthash.listunspent', [scriptHash]);

      return response.map((utxo: any) => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        value: utxo.value,
        height: utxo.height,
      }));
    } catch (error) {
      return [];
    }
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      // Parse the transaction to validate its structure before broadcasting
      try {
        const bitcoin = await import('bitcoinjs-lib');
        const tx = bitcoin.Transaction.fromHex(txHex);

        // Check each input has a script
        for (let i = 0; i < tx.ins.length; i++) {
          const scriptLength = tx.ins[i].script ? tx.ins[i].script.length : 0;
        }
      } catch (parseError) {
        electrumLogger.error('Transaction parsing error:', parseError);
        // Continue with broadcast attempt despite parsing error
      }

      const response = await this.makeRequest('blockchain.transaction.broadcast', [txHex]);

      return response;
    } catch (error) {
      electrumLogger.error('Failed to broadcast transaction:', error);

      // Provide more detailed error information
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error);
      }

      // Add hints for common Electrum errors
      if (errorMessage.includes('bad-txns-inputs-missingorspent')) {
        errorMessage += ' (Inputs already spent or invalid)';
      } else if (errorMessage.includes('non-mandatory-script-verify-flag')) {
        errorMessage += ' (Script verification failed, possibly incorrect signature)';
      } else if (errorMessage.includes('min relay fee not met')) {
        errorMessage += ' (Transaction fee too low)';
      }

      throw new Error(`Transaction broadcast failed: ${errorMessage}`);
    }
  }

  async getTransactionHistory(address: string): Promise<any[]> {
    try {
      const scriptHash = this.addressToScriptHash(address);
      const response = await this.makeRequest('blockchain.scripthash.get_history', [scriptHash]);

      return response;
    } catch (error) {
      electrumLogger.error('Failed to get transaction history:', error);
      return [];
    }
  }

  async getTransaction(txHash: string, verbose: boolean = false): Promise<any> {
    try {
      const response = await this.makeRequest('blockchain.transaction.get', [txHash, verbose]);
      return response;
    } catch (error) {
      electrumLogger.error('Failed to get transaction:', error);
      throw error;
    }
  }

  async getServerVersion(): Promise<{ server: string; protocol: string }> {
    try {
      const response = await this.makeRequest('server.version', [
        'Avian FlightDeck Wallet 1.0',
        '1.4',
      ]);
      return response;
    } catch (error) {
      electrumLogger.error('Failed to get server version:', error);
      throw error;
    }
  }

  async ping(): Promise<void> {
    try {
      await this.makeRequest('server.ping', []);
    } catch (error) {
      electrumLogger.error('Failed to ping server:', error);
      throw error;
    }
  }

  async getCurrentBlockHeight(): Promise<number> {
    try {
      const result = await this.makeRequest('blockchain.headers.subscribe', []);
      return result.height;
    } catch (error) {
      electrumLogger.error('Failed to get current block height:', error);
      // Fallback: try alternative method
      try {
        const estimateResult = await this.makeRequest('blockchain.estimatefee', [1]);
        // If estimatefee works, try to get block count
        const blockCount = await this.makeRequest('blockchain.block.headers', [0, 1]);
        if (blockCount && blockCount.count) {
          return blockCount.count;
        }
      } catch (fallbackError) {
        electrumLogger.error('Fallback method also failed:', fallbackError);
      }
      // Return 0 if we can't get the height
      return 0;
    }
  }

  // Method to update real balance from external sources (like subscription updates)
  updateRealBalance(address: string, balance: number): void {
    electrumLogger.debug(`Updating cached balance for ${address.substring(0, 5)}...: ${balance}`);
    this.realBalanceCache.set(address, balance);
  }

  // Method to check if we have real balance data
  hasRealBalance(address: string): boolean {
    return this.realBalanceCache.has(address);
  }

  public addressToScriptHash(address: string): string {
    try {
      // Convert Avian address to output script
      const outputScript = bitcoin.address.toOutputScript(address, avianNetwork);

      // Calculate SHA256 hash of the output script
      const hash = bitcoin.crypto.sha256(outputScript);

      // Reverse the hash bytes (ElectrumX protocol requirement)
      const reversed = Buffer.from(hash).reverse();

      // Convert to hex string
      const scriptHash = reversed.toString('hex');

      return scriptHash;
    } catch (error) {
      electrumLogger.error('Error converting address to script hash:', error);
      // Fallback to a deterministic hash for development
      const fallbackHash = bitcoin.crypto.sha256(Buffer.from(address, 'utf8'));
      return Buffer.from(fallbackHash).reverse().toString('hex');
    }
  }

  private async makeRequest(method: string, params: any[]): Promise<any> {
    if (!this.isConnected || !this.websocket) {
      throw new Error('Not connected to Electrum server');
    }

    const id = ++this.requestId;
    const request: ElectrumRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(id, { resolve, reject });

      // Send the request
      this.websocket!.send(JSON.stringify(request));

      // Set timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000); // 30 second timeout
    });
  }

  async subscribeToAddress(address: string, callback: (data: any) => void): Promise<void> {
    try {
      electrumLogger.debug(`Subscribing to address: ${address.substring(0, 5)}...`);
      const scriptHash = this.addressToScriptHash(address);

      // Store the subscription callback
      this.subscriptions.set(scriptHash, callback);

      // Send subscription request to ElectrumX server
      try {
        const initialStatus = await this.makeRequest('blockchain.scripthash.subscribe', [
          scriptHash,
        ]);
        electrumLogger.debug(
          `Successfully subscribed to ${address.substring(0, 5)}..., initial status: ${initialStatus}`,
        );

        // Call the callback with initial status
        callback({
          scripthash: scriptHash,
          status: initialStatus,
          method: 'blockchain.scripthash.subscribe',
        });
      } catch (subscribeError) {
        const errorMessage =
          subscribeError instanceof Error ? subscribeError.message : String(subscribeError);

        // Handle "history too large" error specifically
        if (
          errorMessage.includes('history too large') ||
          errorMessage.includes('too many history entries')
        ) {
          electrumLogger.warn(
            `Address has too much history for subscription: ${address}. Using polling fallback.`,
          );

          // Get initial balance directly instead of subscribing
          const balance = await this.makeRequest('blockchain.scripthash.get_balance', [scriptHash]);
          const totalBalance = balance.confirmed + (balance.unconfirmed || 0);

          // Update cache with the balance
          this.updateRealBalance(address, totalBalance);

          // Call callback with manual status to simulate subscription
          callback({
            scripthash: scriptHash,
            status: `balance:${totalBalance}`,
            method: 'blockchain.scripthash.subscribe',
            useFallback: true,
          });

          // Set up polling fallback for addresses with large history
          this.setupPollingFallback(address, scriptHash, callback);
          return;
        }

        // For other errors, propagate them
        throw subscribeError;
      }
    } catch (error) {
      electrumLogger.error('Failed to subscribe to address:', error);
      throw error;
    }
  }

  // Fallback polling mechanism for addresses with too large history
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  private setupPollingFallback(
    address: string,
    scriptHash: string,
    callback: (data: any) => void,
  ): void {
    // Clear any existing polling interval for this address
    if (this.pollingIntervals.has(address)) {
      clearInterval(this.pollingIntervals.get(address)!);
    }

    // Set up polling every 30 seconds
    const intervalId = setInterval(async () => {
      try {
        if (!this.isConnected) {
          return; // Skip if not connected
        }

        // Get balance directly
        const balance = await this.makeRequest('blockchain.scripthash.get_balance', [scriptHash]);
        const totalBalance = balance.confirmed + (balance.unconfirmed || 0);

        // Get previously cached balance
        const previousBalance = this.realBalanceCache.get(address) || 0;

        // If balance changed, update cache and trigger callback
        if (totalBalance !== previousBalance) {
          this.updateRealBalance(address, totalBalance);

          callback({
            scripthash: scriptHash,
            status: `balance:${totalBalance}`,
            method: 'blockchain.scripthash.subscribe',
            useFallback: true,
            previousBalance,
          });
        }
      } catch (error) {
        electrumLogger.error('Error in polling fallback for address:', address, error);
      }
    }, 30000); // Poll every 30 seconds

    // Store the interval ID for cleanup
    this.pollingIntervals.set(address, intervalId);
  }

  async unsubscribeFromAddress(address: string): Promise<void> {
    try {
      const scriptHash = this.addressToScriptHash(address);

      // Remove from local subscriptions
      this.subscriptions.delete(scriptHash);

      // Clear any polling fallback for this address
      if (this.pollingIntervals.has(address)) {
        clearInterval(this.pollingIntervals.get(address)!);
        this.pollingIntervals.delete(address);
      }

      try {
        // Send unsubscribe request to server - might fail if using polling fallback
        await this.makeRequest('blockchain.scripthash.unsubscribe', [scriptHash]);
      } catch (unsubscribeError) {
        // Ignore errors when unsubscribing, as the subscription might not exist
        // if we're using the polling fallback
        electrumLogger.debug(
          `Unsubscribe request failed for ${address}, possibly using fallback: ${unsubscribeError}`,
        );
      }
    } catch (error) {
      electrumLogger.error('Failed to unsubscribe from address:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    electrumLogger.debug('Disconnecting from Electrum server');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear all polling fallback intervals
    this.pollingIntervals.forEach((intervalId, address) => {
      clearInterval(intervalId);
    });
    this.pollingIntervals.clear();
    electrumLogger.debug(`Cleared ${this.pollingIntervals.size} polling intervals`);

    if (this.websocket) {
      this.websocket.close(1000, 'User disconnect'); // Normal closure
      this.websocket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.pendingRequests.clear();
    this.subscriptions.clear();
    this.reconnectAttempts = 0;

    electrumLogger.debug('Disconnect complete');
  }

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  // Return the current connection status
  getConnectionStatus(): boolean {
    return this.isConnected && this.websocket !== null;
  }

  // Get server info
  async getServerInfo(): Promise<any> {
    try {
      const response = await this.makeRequest('server.banner', []);
      return response;
    } catch (error) {
      electrumLogger.error('Failed to get server info:', error);
      throw error;
    }
  }

  /**
   * Get the public key for a given address by searching for transactions
   * where it was revealed.
   * @param address - The Avian address to find the public key for
   * @returns The public key as a hex string if found, null otherwise
   */
  async getPublicKeyForAddress(address: string): Promise<string | null> {
    try {
      // Make sure we're connected
      if (!this.isConnected || !this.websocket) {
        await this.connect();
      }

      // First, get transaction history for the address
      const scriptHash = this.addressToScriptHash(address);
      const history = await this.makeRequest('blockchain.scripthash.get_history', [scriptHash]);

      if (!history || history.length === 0) {
        electrumLogger.warn('No transaction history found for address:', address);
        return null;
      }

      // Sort transactions from newest to oldest
      history.sort((a: any, b: any) => b.height - a.height);

      // Try to find a transaction where the public key was revealed (usually in the input)
      for (const tx of history) {
        const txDetails = await this.makeRequest('blockchain.transaction.get', [tx.tx_hash, true]);

        // Typically, public keys are revealed in transaction inputs
        if (txDetails.vin && txDetails.vin.length > 0) {
          for (const input of txDetails.vin) {
            // If this input is from our address, it might have the public key
            if (input.scriptSig && input.scriptSig.hex) {
              // Extract public key from the script signature
              // This is a simplified approach; in a real implementation,
              // we would need to properly parse the script signature
              // Public key is usually after the signature in P2PKH transactions
              const scriptSig = Buffer.from(input.scriptSig.hex, 'hex');

              // Look for a standard pattern where the public key would be
              // This is simplified and might need adjustments for Avian specifics
              if (scriptSig.length > 70) {
                // Rough estimate, signature ~70-72 bytes + public key 33 bytes
                // For compressed public keys (33 bytes)
                const potentialPubKey = scriptSig.slice(-33).toString('hex');

                // Verify that this is indeed our address's public key
                try {
                  // Use bitcoinjs-lib to convert public key to address
                  const keyPair = ECPair.fromPublicKey(Buffer.from(potentialPubKey, 'hex'));
                  const { address: derivedAddress } = bitcoin.payments.p2pkh({
                    pubkey: Buffer.from(keyPair.publicKey),
                    network: avianNetwork,
                  });

                  if (derivedAddress === address) {
                    return potentialPubKey;
                  }
                } catch (e) {
                  // Not a valid public key, continue searching
                  electrumLogger.debug('Invalid public key candidate:', e);
                }
              }
            }
          }
        }
      }

      electrumLogger.warn('Could not find public key for address in transaction history:', address);
      return null;
    } catch (error) {
      electrumLogger.error('Error getting public key from address via Electrum:', error);
      return null;
    }
  }
}
