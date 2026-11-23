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

export interface PairingHttpGateway {
    request(body: PairingRequestBody): Promise<PairingRequestView>;
    check(body: PairingCheckBody): Promise<PairingCheckView>;
    approve(pairingId: string, body: PairingApproveBody): Promise<PairingDecisionView>;
    deny(pairingId: string): Promise<PairingDecisionView>;
    claim(pairingId: string): Promise<PairingClaimView>;
    revoke(pairingId: string): Promise<PairingDecisionView>;
    list(): Promise<PairingListView>;
}

export const createPairingHttpGateway = (exec: HttpGatewayExecutor): PairingHttpGateway => {
    const pairings = () => `${exec.resolveEndpoint('relay')}/pairings`;
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
