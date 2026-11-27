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
import type { IPairingHttpDataSource } from '@chatic/data-api';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface PairingRequestInput {
    purpose: PairingPurpose;
    deviceId: string;
    client?: Pick<PairingClient, 'name' | 'platform'>;
}

export interface IPairingRepository extends DisposableRepository {
    requestPairing(input: PairingRequestInput): Promise<PairingRequestView>;
    claimPairing(pairingId: string): Promise<PairingClaimView>;
    checkPairing(code: string): Promise<PairingCheckView>;
    approvePairing(pairingId: string, target: PairingTarget): Promise<PairingDecisionView>;
    denyPairing(pairingId: string): Promise<PairingDecisionView>;
    listPairings(): Promise<PairingListView>;
    revokePairing(pairingId: string): Promise<PairingDecisionView>;
}

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
