import type {
    PairingCheckView,
    PairingClaimView,
    PairingClient,
    PairingDecisionView,
    PairingListView,
    PairingPurpose,
    PairingRequestView,
    PairingTarget,
} from '@chatic/http';
import type { IPairingHttpDataSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface PairingRequestInput {
    /** Always `web` from this app; `debug` is the developer tool's. */
    purpose: PairingPurpose;
    /** The device id the current session was created with — the server refuses any other. */
    deviceId: string;
    client?: Pick<PairingClient, 'name' | 'platform'>;
}

export interface IPairingRepository extends DisposableRepository {
    /** The requesting device (a guest session) asks for a code to show. */
    requestPairing(input: PairingRequestInput): Promise<PairingRequestView>;
    /**
     * The requesting device polls for the outcome. The answer is returned exactly as the server sent
     * it: on a relay approval the first `approved` answer carries the session, and only that one does.
     */
    claimPairing(pairingId: string): Promise<PairingClaimView>;
    /** The approving device looks up a code. Anything that is not a digit is dropped first. */
    checkPairing(code: string): Promise<PairingCheckView>;
    approvePairing(pairingId: string, target: PairingTarget): Promise<PairingDecisionView>;
    denyPairing(pairingId: string): Promise<PairingDecisionView>;
    /** The pairings this account approved — the device management screen's second section. */
    listPairings(): Promise<PairingListView>;
    /** Withdraws an approval. A relay approval's session is signed out with it. */
    revokePairing(pairingId: string): Promise<PairingDecisionView>;
}

/**
 * Device pairing: a browser (or a phone that is not signed in) shows a code, and a signed-in app
 * approves it.
 *
 * Remote-only and HTTP-only, same shape as `SubscriptionRepository` and `ReportRepository`: a pairing
 * is a handshake, not an entity to cache, and every operation is a signed request to the relay —
 * never to the cloud the session happens to be working in, which does not serve `/pairings`.
 *
 * **It performs the calls and installs nothing.** `claimPairing` can return a session; applying it
 * (the relay socket's re-registration included) is `app-runtime`'s, through the same path a phone
 * login takes. Nothing here reads a token, writes a store or flips auth state.
 *
 * `IPairingHttpDataSource` injection is optional for the same reason as its siblings — every
 * `createRepositories` call site (tests included) constructs this repository, wired or not — and every
 * method throws a clear "not wired yet" error until it is injected.
 */
export class PairingRepository extends BaseRepository implements IPairingRepository {
    constructor(
        contextProvider: DataContextProvider,
        private readonly pairingHttpDataSource?: IPairingHttpDataSource
    ) {
        super(contextProvider);
    }

    private requireHttp(): IPairingHttpDataSource {
        if (!this.pairingHttpDataSource) {
            throw new Error('[PairingRepository] IPairingHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.pairingHttpDataSource;
    }

    public async requestPairing(input: PairingRequestInput): Promise<PairingRequestView> {
        return this.requireHttp().requestPairing(input);
    }

    public async claimPairing(pairingId: string): Promise<PairingClaimView> {
        return this.requireHttp().claimPairing(pairingId);
    }

    public async checkPairing(code: string): Promise<PairingCheckView> {
        // People paste the code as it is shown (`0734-4168`) or with spaces. The server strips them as
        // well, but the code that leaves this app is the digits alone.
        return this.requireHttp().checkPairing(code.replace(/\D/g, ''));
    }

    public async approvePairing(pairingId: string, target: PairingTarget): Promise<PairingDecisionView> {
        return this.requireHttp().approvePairing(pairingId, target);
    }

    public async denyPairing(pairingId: string): Promise<PairingDecisionView> {
        return this.requireHttp().denyPairing(pairingId);
    }

    public async listPairings(): Promise<PairingListView> {
        return this.requireHttp().listPairings();
    }

    public async revokePairing(pairingId: string): Promise<PairingDecisionView> {
        return this.requireHttp().revokePairing(pairingId);
    }
}
