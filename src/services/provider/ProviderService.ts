/**
 * Avian Connect request engine.
 *
 * A ProviderService instance is bound to a single pinned origin and routes parsed envelopes to
 * phase-1 methods, enforcing permissions on the way. It deliberately knows nothing about React,
 * postMessage or redirects — the transport hands it a raw message and gets a response envelope
 * back — and it can only return what the ProviderHost gives it: an address, an optional public
 * key, a base64 signature, or a network descriptor. No key material passes through here.
 */

import {
  ConnectEventName,
  ConnectResponse,
  ConnectResult,
  DisconnectResult,
  NetworkResult,
  OriginPermission,
  SignMessageResult,
} from '@/types/avianConnect';
import { providerLogger } from '@/lib/Logger';
import { PermissionService } from './PermissionService';
import { makeError, makeResult, parseRequest, parseSignMessageParams } from './protocol';

/** What the connect approval screen hands back. */
export interface ConnectApprovalDecision {
  approved: boolean;
  /** Accounts the user chose to expose. Empty when rejected. */
  accounts: string[];
  /** When true the grant is persisted and later connect() calls resolve silently. */
  remember: boolean;
}

/**
 * The wallet-side capabilities the engine needs. The /connect page implements this with the
 * approval dialogs, SecurityContext.requireAuth and WalletService.
 */
export interface ProviderHost {
  /** Locked, or no wallet set up at all. */
  isLocked(): boolean;
  requestConnectApproval(origin: string): Promise<ConnectApprovalDecision>;
  /** Shows the origin and the verbatim message; resolves false when the user declines. */
  requestSignApproval(origin: string, message: string, account: string): Promise<boolean>;
  /**
   * Authenticates the user (password or biometric) and signs. Resolves null when the user
   * cancels authentication. Never resolves with anything but a base64 signature.
   */
  signMessage(account: string, message: string): Promise<string | null>;
  getPublicKey(account: string): Promise<string | undefined>;
  getNetwork(): Promise<NetworkResult>;
  emit(event: ConnectEventName, data: unknown): void;
}

export class ProviderService {
  private readonly origin: string;
  private readonly host: ProviderHost;
  /**
   * Accounts approved for this window only, when the user did not tick "remember". Persisted
   * grants are re-read from storage on every call so a revoke in Settings takes effect at once.
   */
  private sessionAccounts: string[] | null = null;

  constructor(origin: string, host: ProviderHost) {
    this.origin = origin;
    this.host = host;
  }

  getOrigin(): string {
    return this.origin;
  }

  /** Parses and dispatches one inbound message. Always resolves with a response envelope. */
  async handle(raw: unknown): Promise<ConnectResponse> {
    const parsed = parseRequest(raw);
    if (!parsed.ok) {
      return { avianConnect: 1, id: parsed.id ?? '', error: parsed.error };
    }

    const { id, method, params } = parsed.request;

    try {
      switch (method) {
        case 'connect':
          return await this.connect(id);
        case 'getAccounts':
          return await this.getAccounts(id);
        case 'signMessage':
          return await this.signMessage(id, params);
        case 'getNetwork':
          return await this.getNetwork(id);
        case 'disconnect':
          return await this.disconnect(id);
        default:
          return makeError(
            id,
            'UNSUPPORTED_METHOD',
            `Method "${method}" is not supported in this version of Avian Connect`,
          );
      }
    } catch (error) {
      providerLogger.error(`Avian Connect method ${method} failed:`, error);
      // Deliberately generic: internal failures must not leak wallet state to the page.
      return makeError(id, 'INVALID_REQUEST', 'The wallet could not complete this request');
    }
  }

  /** Accounts this origin may currently see: a persisted grant wins over a one-shot approval. */
  private async resolveAccounts(): Promise<string[]> {
    const permission: OriginPermission | null = await PermissionService.get(this.origin);
    if (permission) return permission.accounts;
    return this.sessionAccounts ?? [];
  }

  private async connect(id: string): Promise<ConnectResponse> {
    if (this.host.isLocked()) {
      return makeError(id, 'WALLET_LOCKED', 'The wallet is locked');
    }

    const remembered = await PermissionService.get(this.origin);
    if (remembered && remembered.accounts.length > 0) {
      await PermissionService.touch(this.origin);
      return makeResult(id, await this.describeAccount(remembered.accounts[0]));
    }

    const decision = await this.host.requestConnectApproval(this.origin);
    if (!decision.approved || decision.accounts.length === 0) {
      return makeError(id, 'USER_REJECTED', 'User rejected the connection request');
    }

    if (decision.remember) {
      await PermissionService.grant(this.origin, decision.accounts);
      this.sessionAccounts = null;
    } else {
      this.sessionAccounts = decision.accounts;
    }

    this.host.emit('accountsChanged', { accounts: decision.accounts });
    return makeResult(id, await this.describeAccount(decision.accounts[0]));
  }

  private async describeAccount(address: string): Promise<ConnectResult> {
    const publicKey = await this.host.getPublicKey(address);
    return publicKey ? { address, publicKey } : { address };
  }

  private async getAccounts(id: string): Promise<ConnectResponse> {
    const accounts = await this.resolveAccounts();
    if (accounts.length === 0) {
      return makeError(id, 'ORIGIN_NOT_APPROVED', 'This site has not been granted account access');
    }
    await PermissionService.touch(this.origin);
    return makeResult(id, accounts);
  }

  private async signMessage(
    id: string,
    params: Record<string, unknown> | undefined,
  ): Promise<ConnectResponse> {
    if (this.host.isLocked()) {
      return makeError(id, 'WALLET_LOCKED', 'The wallet is locked');
    }

    const accounts = await this.resolveAccounts();
    if (accounts.length === 0) {
      return makeError(id, 'ORIGIN_NOT_APPROVED', 'This site has not been granted account access');
    }

    const parsedParams = parseSignMessageParams(params);
    if (!parsedParams.ok) {
      return { avianConnect: 1, id, error: parsedParams.error };
    }

    const account = accounts[0];

    // Remembering a site skips the connect screen only: every signature is approved explicitly.
    const approved = await this.host.requestSignApproval(this.origin, parsedParams.message, account);
    if (!approved) {
      return makeError(id, 'USER_REJECTED', 'User rejected the signature request');
    }

    // The host performs requireAuth before touching the key; a cancelled prompt lands here.
    const signature = await this.host.signMessage(account, parsedParams.message);
    if (!signature) {
      return makeError(id, 'USER_REJECTED', 'Authentication was cancelled');
    }

    await PermissionService.touch(this.origin);
    const result: SignMessageResult = { signature };
    return makeResult(id, result);
  }

  private async getNetwork(id: string): Promise<ConnectResponse> {
    // Network identification carries no user data, so it needs no permission.
    const network: NetworkResult = await this.host.getNetwork();
    return makeResult(id, network);
  }

  private async disconnect(id: string): Promise<ConnectResponse> {
    await PermissionService.revoke(this.origin);
    this.sessionAccounts = null;
    this.host.emit('accountsChanged', { accounts: [] });
    this.host.emit('disconnect', { reason: 'Disconnected by the site' });
    const result: DisconnectResult = { disconnected: true };
    return makeResult(id, result);
  }

  /** Called by the transport when permissions change underneath a live session. */
  async refreshAccounts(): Promise<string[]> {
    const accounts = await this.resolveAccounts();
    this.host.emit('accountsChanged', { accounts });
    return accounts;
  }

  /** Drops a one-shot approval without touching persisted grants. */
  clearSession(): void {
    this.sessionAccounts = null;
  }
}
