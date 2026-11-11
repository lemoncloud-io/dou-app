import { PairingHttpDataSource } from './PairingHttpDataSource';

import type { PairingHttpDomainGateway } from '../gateways';

describe('PairingHttpDataSource', () => {
    let gateway: jest.Mocked<PairingHttpDomainGateway>;
    let dataSource: PairingHttpDataSource;

    beforeEach(() => {
        gateway = {
            request: jest.fn(),
            check: jest.fn(),
            approve: jest.fn(),
            deny: jest.fn(),
            claim: jest.fn(),
            revoke: jest.fn(),
            list: jest.fn(),
        };
        dataSource = new PairingHttpDataSource(gateway);
    });

    it('requestPairing hands the body to request as it is', async () => {
        const body = {
            purpose: 'web' as const,
            deviceId: 'dev-1',
            client: { name: 'Chrome · macOS', platform: 'web' },
        };

        await dataSource.requestPairing(body);

        expect(gateway.request).toHaveBeenCalledWith(body);
    });

    it('checkPairing wraps the code in the check body', async () => {
        await dataSource.checkPairing('07344168');

        expect(gateway.check).toHaveBeenCalledWith({ code: '07344168' });
    });

    it('approvePairing wraps the target in the approve body', async () => {
        await dataSource.approvePairing('p-1', { type: 'cloud', cloudId: '1000002' });

        expect(gateway.approve).toHaveBeenCalledWith('p-1', { target: { type: 'cloud', cloudId: '1000002' } });
    });

    it.each([
        ['denyPairing', 'deny'],
        ['claimPairing', 'claim'],
        ['revokePairing', 'revoke'],
    ] as const)('%s sends %s for the pairing id', async (method, op) => {
        await dataSource[method]('p-1');

        expect(gateway[op]).toHaveBeenCalledWith('p-1');
    });

    it('listPairings sends list', async () => {
        await dataSource.listPairings();

        expect(gateway.list).toHaveBeenCalledTimes(1);
    });

    // The first approved answer of a relay approval is the only one carrying the session.
    it('returns the claim answer untouched, session and all', async () => {
        const answer = {
            status: 'approved' as const,
            target: { type: 'relay' as const },
            approver: { name: 'developer' },
            session: { id: 'u-1', $auth: { id: 'a-1', purpose: 'web', pairingId: 'p-1' } } as never,
        };
        gateway.claim.mockResolvedValue(answer);

        await expect(dataSource.claimPairing('p-1')).resolves.toBe(answer);
    });

    it('lets a refused call reject with the original error', async () => {
        const error = Object.assign(new Error('403 FORBIDDEN'), { status: 403 });
        gateway.request.mockRejectedValue(error);

        await expect(dataSource.requestPairing({ purpose: 'web', deviceId: 'dev-1' })).rejects.toBe(error);
    });
});
