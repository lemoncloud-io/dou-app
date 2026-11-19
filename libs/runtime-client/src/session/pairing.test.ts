import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { createPairedCloudCheck, createPairingRequestFlow } from './pairing';

const checkPairedClouds = jest.fn();
const claimPairing = jest.fn();
const applyPairingSession = jest.fn(async () => undefined);
const preparePairedCloudEntry = jest.fn(async () => undefined);
const session = fakeSessionView();
const paired = (cloudIds: string[]) => session.set({ pairing: { ...emptySessionSnapshot().pairing, cloudIds } });

beforeEach(() => {
    jest.clearAllMocks();
    paired(['1000002']);
    checkPairedClouds.mockResolvedValue([]);
    initAppRuntime({
        ...coreEngine,
        session,
        commands: fakeSessionCommands({
            checkPairedClouds,
            claimPairing,
            applyPairingSession,
            preparePairedCloudEntry,
        }),
    });
});

afterEach(() => {
    jest.useRealTimers();
    resetRuntimeEngine();
});

describe('createPairedCloudCheck', () => {
    it('hands each cloud the relay stopped delegating to onEnded', async () => {
        checkPairedClouds.mockResolvedValue(['1000002', '1000003']);
        const onEnded = jest.fn();

        await createPairedCloudCheck(onEnded)();

        expect(checkPairedClouds).toHaveBeenCalledTimes(1);
        expect(onEnded.mock.calls).toEqual([['1000002'], ['1000003']]);
    });

    it('does nothing at all with no paired cloud', async () => {
        paired([]);

        await createPairedCloudCheck(jest.fn())();

        expect(checkPairedClouds).not.toHaveBeenCalled();
    });

    it('drops a call made while the last one still runs, and runs again once it settled', async () => {
        let finish: (ended: string[]) => void = () => undefined;
        checkPairedClouds.mockImplementationOnce(() => new Promise<string[]>(resolve => (finish = resolve)));
        const check = createPairedCloudCheck(jest.fn());

        const first = check();
        await check();
        expect(checkPairedClouds).toHaveBeenCalledTimes(1);

        finish([]);
        await first;
        await check();
        expect(checkPairedClouds).toHaveBeenCalledTimes(2);
    });

    it('runs again after a check that threw', async () => {
        checkPairedClouds.mockRejectedValueOnce(new Error('relay down'));
        const check = createPairedCloudCheck(jest.fn());

        await expect(check()).rejects.toThrow('relay down');
        await check();

        expect(checkPairedClouds).toHaveBeenCalledTimes(2);
    });
});

describe('createPairingRequestFlow', () => {
    const CODE = { pairingId: 'p-1', code: '07344168', expiredAt: Date.now() + 180_000, interval: 5 };
    const flush = async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    };

    beforeEach(() => jest.useFakeTimers());

    it("claims through the engine's commands and signs in with a relay approval's handle", async () => {
        claimPairing.mockResolvedValue({ status: 'approved', target: { type: 'relay' }, sessionHandle: 'h-1' });
        const flow = createPairingRequestFlow({
            request: async () => CODE as never,
            onChange: jest.fn(),
            switchCloud: jest.fn(),
        });

        flow.start();
        await flush();
        jest.advanceTimersByTime(5000);
        await flush();
        flow.stop();

        expect(claimPairing).toHaveBeenCalledWith('p-1');
        expect(applyPairingSession).toHaveBeenCalledWith('h-1');
    });

    it("prepares a cloud approval through the engine, then enters it through the screen's switch", async () => {
        claimPairing.mockResolvedValue({ status: 'approved', target: { type: 'cloud', cloudId: 'c-9' } });
        const order: string[] = [];
        preparePairedCloudEntry.mockImplementation(async () => void order.push('prepare'));
        const switchCloud = jest.fn(async () => void order.push('switch'));
        const flow = createPairingRequestFlow({ request: async () => CODE as never, onChange: jest.fn(), switchCloud });

        flow.start();
        await flush();
        jest.advanceTimersByTime(5000);
        await flush();
        flow.stop();

        expect(preparePairedCloudEntry).toHaveBeenCalledWith('c-9');
        expect(switchCloud).toHaveBeenCalledWith('c-9');
        expect(order).toEqual(['prepare', 'switch']);
    });
});
