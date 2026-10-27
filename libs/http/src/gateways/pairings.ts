import type {
    PairingApproveBody,
    PairingCheckBody,
    PairingCheckView,
    PairingClaimView,
    PairingDecisionView,
    PairingListView,
    PairingRequestBody,
    PairingRequestView,
} from './pairingTypes';
import type { HttpGatewayExecutor } from './types';

/**
 * `/pairings/**` relay resource wire vocabulary — one path per operation.
 *
 * Every call is a signed relay request, whichever cloud the session is working in: pairing records
 * live on the relay, and a cloud server does not serve `/pairings`. The requesting device signs with
 * its guest session and the approving device with its device session; the server tells them apart.
 */
export interface PairingHttpGateway {
    /** POST {relay}/pairings/0/request — a guest session asks for a code. */
    request(body: PairingRequestBody): Promise<PairingRequestView>;
    /** POST {relay}/pairings/0/check — the approving device looks up the code it was shown. */
    check(body: PairingCheckBody): Promise<PairingCheckView>;
    /** POST {relay}/pairings/{id}/approve */
    approve(pairingId: string, body: PairingApproveBody): Promise<PairingDecisionView>;
    /** POST {relay}/pairings/{id}/deny */
    deny(pairingId: string): Promise<PairingDecisionView>;
    /** POST {relay}/pairings/{id}/claim — the requesting device polls for the outcome. */
    claim(pairingId: string): Promise<PairingClaimView>;
    /** POST {relay}/pairings/{id}/revoke — the approving account withdraws an approval. */
    revoke(pairingId: string): Promise<PairingDecisionView>;
    /** GET {relay}/pairings — the pairings this account approved. */
    list(): Promise<PairingListView>;
}

export const createPairingHttpGateway = (exec: HttpGatewayExecutor): PairingHttpGateway => {
    const pairings = () => `${exec.resolveEndpoint('relay')}/pairings`;
    // The commands carry no body of their own, but they are POSTs; send an empty object rather than
    // none, as `clouds.release` does.
    const command = <T>(pairingId: string, cmd: 'deny' | 'claim' | 'revoke') =>
        exec.executeSignedRelayRequest<T, Record<string, never>>({
            method: 'POST',
            baseURL: `${pairings()}/${pairingId}/${cmd}`,
            body: {},
        });

    return {
        request: body =>
            exec.executeSignedRelayRequest<PairingRequestView, PairingRequestBody>({
                method: 'POST',
                baseURL: `${pairings()}/0/request`,
                body,
            }),

        check: body =>
            exec.executeSignedRelayRequest<PairingCheckView, PairingCheckBody>({
                method: 'POST',
                baseURL: `${pairings()}/0/check`,
                body,
            }),

        approve: (pairingId, body) =>
            exec.executeSignedRelayRequest<PairingDecisionView, PairingApproveBody>({
                method: 'POST',
                baseURL: `${pairings()}/${pairingId}/approve`,
                body,
            }),

        deny: pairingId => command<PairingDecisionView>(pairingId, 'deny'),
        claim: pairingId => command<PairingClaimView>(pairingId, 'claim'),
        revoke: pairingId => command<PairingDecisionView>(pairingId, 'revoke'),

        list: () =>
            exec.executeSignedRelayRequest<PairingListView>({
                method: 'GET',
                baseURL: pairings(),
            }),
    };
};
