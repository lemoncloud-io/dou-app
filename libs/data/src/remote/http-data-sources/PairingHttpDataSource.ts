import type {
    PairingCheckView,
    PairingClaimView,
    PairingDecisionView,
    PairingListView,
    PairingRequestBody,
    PairingRequestView,
    PairingTarget,
} from '@chatic/http';
import type { PairingHttpDomainGateway } from '../gateways';

export interface IPairingHttpDataSource {
    requestPairing(body: PairingRequestBody): Promise<PairingRequestView>;
    checkPairing(code: string): Promise<PairingCheckView>;
    approvePairing(pairingId: string, target: PairingTarget): Promise<PairingDecisionView>;
    denyPairing(pairingId: string): Promise<PairingDecisionView>;
    claimPairing(pairingId: string): Promise<PairingClaimView>;
    revokePairing(pairingId: string): Promise<PairingDecisionView>;
    listPairings(): Promise<PairingListView>;
}

/**
 * Device pairing — the relay's `/pairings/**` operations.
 *
 * **Nothing is mapped and nothing is cached.** A pairing is a short-lived handshake, not an entity the
 * app keeps: the screens read the server's fields as they are, and the one list (`GET /pairings`) is
 * react-query's to cache. `claim`'s answer in particular passes through untouched — on a relay approval
 * its first `approved` answer carries the session, and that answer is never sent again.
 *
 * **Errors pass through untouched** too: the screens tell the outcomes apart by HTTP status and reason.
 */
export class PairingHttpDataSource implements IPairingHttpDataSource {
    constructor(private readonly gateway: PairingHttpDomainGateway) {}

    requestPairing(body: PairingRequestBody): Promise<PairingRequestView> {
        return this.gateway.request(body);
    }

    checkPairing(code: string): Promise<PairingCheckView> {
        return this.gateway.check({ code });
    }

    approvePairing(pairingId: string, target: PairingTarget): Promise<PairingDecisionView> {
        return this.gateway.approve(pairingId, { target });
    }

    denyPairing(pairingId: string): Promise<PairingDecisionView> {
        return this.gateway.deny(pairingId);
    }

    claimPairing(pairingId: string): Promise<PairingClaimView> {
        return this.gateway.claim(pairingId);
    }

    revokePairing(pairingId: string): Promise<PairingDecisionView> {
        return this.gateway.revoke(pairingId);
    }

    listPairings(): Promise<PairingListView> {
        return this.gateway.list();
    }
}
