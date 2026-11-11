import { PairingRepository } from './PairingRepository';
import { DataContextHolder } from './types';

import type { IPairingHttpDataSource } from '../remote/http-data-sources';

const context = new DataContextHolder({ cid: '1000002', uid: 'u1' });

describe('PairingRepository', () => {
    let httpDataSource: jest.Mocked<IPairingHttpDataSource>;
    let repository: PairingRepository;

    beforeEach(() => {
        httpDataSource = {
            requestPairing: jest.fn(),
            checkPairing: jest.fn(),
            approvePairing: jest.fn(),
            denyPairing: jest.fn(),
            claimPairing: jest.fn(),
            revokePairing: jest.fn(),
            listPairings: jest.fn(),
        };
        repository = new PairingRepository(context, httpDataSource);
    });

    it.each([
        ['07344168', '07344168'],
        ['0734-4168', '07344168'],
        [' 0734 4168\n', '07344168'],
    ])('checkPairing sends only the digits of %j', async (typed, sent) => {
        await repository.checkPairing(typed);

        expect(httpDataSource.checkPairing).toHaveBeenCalledWith(sent);
    });

    it('requestPairing passes the purpose, device id and client through', async () => {
        const input = {
            purpose: 'web' as const,
            deviceId: 'dev-1',
            client: { name: 'Chrome · macOS', platform: 'web' },
        };
        httpDataSource.requestPairing.mockResolvedValue({
            pairingId: 'p-1',
            code: '07344168',
            expiredAt: 1,
            interval: 5,
        });

        await expect(repository.requestPairing(input)).resolves.toMatchObject({ pairingId: 'p-1', interval: 5 });
        expect(httpDataSource.requestPairing).toHaveBeenCalledWith(input);
    });

    it('claimPairing returns the answer exactly as it came', async () => {
        const answer = {
            status: 'approved' as const,
            target: { type: 'relay' as const },
            approver: {},
            session: {} as never,
        };
        httpDataSource.claimPairing.mockResolvedValue(answer);

        await expect(repository.claimPairing('p-1')).resolves.toBe(answer);
    });

    it.each([
        ['approvePairing', ['p-1', { type: 'relay' }]],
        ['denyPairing', ['p-1']],
        ['revokePairing', ['p-1']],
        ['listPairings', []],
    ] as const)('%s passes its arguments through', async (method, args) => {
        await (repository[method] as (...a: unknown[]) => Promise<unknown>)(...args);

        expect(httpDataSource[method]).toHaveBeenCalledWith(...args);
    });

    it('says so plainly when the HTTP source was never injected', async () => {
        const unwired = new PairingRepository(context);

        await expect(unwired.listPairings()).rejects.toThrow('IPairingHttpDataSource is not injected');
    });
});
