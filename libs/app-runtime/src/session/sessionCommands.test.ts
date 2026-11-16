import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';
import type { SessionCommands } from '@chatic/runtime-core';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import {
    cancelPhoneLogin,
    clearSiteSelection,
    createCredentialsByProvider,
    forgetRefusedPairedCloud,
    logoutSession,
    patchRelaySessionUser,
} from './sessionCommands';

const mockWarn = jest.fn();
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn(), debug: jest.fn() },
}));

const session = fakeSessionView();
const withCommands = (commands: Partial<SessionCommands>) =>
    initAppRuntime({ ...coreEngine, session, commands: fakeSessionCommands(commands) });

// What the relay answers when the pairing behind a cloud has ended.
const endedPairing = () =>
    Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403, data: '403 NOT ALLOWED - pairing revoked' },
    });

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    jest.clearAllMocks();
    session.set({ pairing: { ...emptySessionSnapshot().pairing, cloudIds: ['1000002'] } });
});

afterEach(() => resetRuntimeEngine());

describe('the session commands the app calls', () => {
    it("run through the engine's commands", async () => {
        const logout = jest.fn(async () => undefined);
        const loginByOAuthCode = jest.fn(async () => ({ uid: 'u1' }) as never);
        withCommands({ logout, loginByOAuthCode });

        await logoutSession({ preserveUrl: true });
        await expect(createCredentialsByProvider(undefined, 'code-1')).resolves.toEqual({ uid: 'u1' });

        expect(logout).toHaveBeenCalledWith({ preserveUrl: true });
        // Google when the caller names no provider, as before.
        expect(loginByOAuthCode).toHaveBeenCalledWith('google', 'code-1', undefined);
    });

    it('run a command nobody waits for, and say when it fails', async () => {
        const patchRelayUser = jest.fn(async () => undefined);
        const clear = jest.fn(async () => {
            throw new Error('store locked');
        });
        withCommands({ patchRelayUser, clearSiteSelection: clear, cancelPhoneLogin: async () => undefined });

        expect(patchRelaySessionUser({ name: 'New' })).toBeUndefined();
        clearSiteSelection();
        cancelPhoneLogin();
        await flush();

        expect(patchRelayUser).toHaveBeenCalledWith({ name: 'New' });
        expect(mockWarn).toHaveBeenCalledTimes(1);
        expect(mockWarn).toHaveBeenCalledWith('SESSION', '[sessionCommands] clearSiteSelection failed', {
            error: expect.any(Error),
        });
    });
});

describe('forgetRefusedPairedCloud', () => {
    it('ends a paired cloud refused over an ended pairing, and says so at once', async () => {
        const endPairedCloud = jest.fn(async () => true);
        withCommands({ endPairedCloud });

        expect(forgetRefusedPairedCloud('1000002', endedPairing())).toBe(true);
        expect(endPairedCloud).toHaveBeenCalledWith('1000002');
    });

    it('leaves a cloud that is not a paired one', () => {
        const endPairedCloud = jest.fn(async () => true);
        withCommands({ endPairedCloud });

        expect(forgetRefusedPairedCloud('1000009', endedPairing())).toBe(false);
        expect(endPairedCloud).not.toHaveBeenCalled();
    });

    it('leaves a paired cloud refused for any other reason — stale credentials are refused the same way', () => {
        const endPairedCloud = jest.fn(async () => true);
        withCommands({ endPairedCloud });
        const stale = Object.assign(new Error('403'), { response: { status: 403, data: 'invalid signature' } });

        expect(forgetRefusedPairedCloud('1000002', stale)).toBe(false);
        expect(endPairedCloud).not.toHaveBeenCalled();
    });
});
