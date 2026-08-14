import { requestSessionRefresh } from './requestSessionRefresh';
import type { ISocketManager } from '../types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockRefreshRelaySession = jest.fn();
const mockRefreshActiveCloudSession = jest.fn();
jest.mock('@chatic/web-core', () => ({
    refreshRelaySession: (...args: unknown[]) => mockRefreshRelaySession(...args),
    refreshActiveCloudSession: (...args: unknown[]) => mockRefreshActiveCloudSession(...args),
}));

/** Fake AuthController driving the socket-owned refresh path (state + listener emitters). */
const makeAuth = ({ state = 'authenticated' } = {}) => {
    const tokenListeners: Array<(view: unknown) => void> = [];
    const stateListeners: Array<(state: string) => void> = [];
    return {
        state,
        runRefresh: jest.fn().mockResolvedValue(undefined),
        onTokenRefresh: jest.fn((listener: (view: unknown) => void) => {
            tokenListeners.push(listener);
            return () => tokenListeners.splice(tokenListeners.indexOf(listener), 1);
        }),
        onAuthState: jest.fn((listener: (state: string) => void) => {
            stateListeners.push(listener);
            return () => stateListeners.splice(stateListeners.indexOf(listener), 1);
        }),
        emitTokenRefresh: (view: unknown) => [...tokenListeners].forEach(l => l(view)),
        emitAuthState: (next: string) => [...stateListeners].forEach(l => l(next)),
    };
};

type FakeAuth = ReturnType<typeof makeAuth>;

const makeManager = (client: { auth?: FakeAuth; state?: string } | null): ISocketManager =>
    ({
        getClient: jest.fn(() => client),
    }) as unknown as ISocketManager;

describe('requestSessionRefresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRefreshRelaySession.mockResolvedValue(undefined);
        mockRefreshActiveCloudSession.mockResolvedValue(undefined);
    });

    it('drives the refresh through a live authenticated controller and resolves on the writeback', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestSessionRefresh('relay', { manager });
        expect(auth.runRefresh).toHaveBeenCalledTimes(1);

        auth.emitTokenRefresh({ Token: { identityToken: 'fresh' } });
        await expect(pending).resolves.toBe(true);
        // The socket owned it — the HTTP fallback must not fire.
        expect(mockRefreshRelaySession).not.toHaveBeenCalled();
    });

    it('reports false when the socket refresh is rejected (failed state)', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestSessionRefresh('relay', { manager });
        auth.emitAuthState('failed');

        await expect(pending).resolves.toBe(false);
        expect(mockRefreshRelaySession).not.toHaveBeenCalled();
    });

    it('reports false when the socket refresh never acks within the timeout', async () => {
        jest.useFakeTimers();
        try {
            const auth = makeAuth();
            const manager = makeManager({ auth, state: 'connected' });

            const pending = requestSessionRefresh('relay', { manager });
            jest.advanceTimersByTime(10_000);

            await expect(pending).resolves.toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('falls back to the relay service refresh when no slot is bound', async () => {
        await expect(requestSessionRefresh('relay', { manager: makeManager(null) })).resolves.toBe(true);

        expect(mockRefreshRelaySession).toHaveBeenCalledTimes(1);
    });

    it('falls back when the socket is bound but not connected', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'closed' });

        await expect(requestSessionRefresh('relay', { manager })).resolves.toBe(true);

        expect(auth.runRefresh).not.toHaveBeenCalled();
        expect(mockRefreshRelaySession).toHaveBeenCalledTimes(1);
    });

    it('falls back when the controller is not authenticated (mid-backoff/expired)', async () => {
        const auth = makeAuth({ state: 'expired' });
        const manager = makeManager({ auth, state: 'connected' });

        await expect(requestSessionRefresh('relay', { manager })).resolves.toBe(true);

        expect(auth.runRefresh).not.toHaveBeenCalled();
        expect(mockRefreshRelaySession).toHaveBeenCalledTimes(1);
    });

    it('routes the cloud fallback through refreshActiveCloudSession', async () => {
        await expect(requestSessionRefresh('cloud', { manager: makeManager(null) })).resolves.toBe(true);

        expect(mockRefreshActiveCloudSession).toHaveBeenCalledTimes(1);
        expect(mockRefreshRelaySession).not.toHaveBeenCalled();
    });

    it('reports false when the HTTP fallback refresh throws', async () => {
        mockRefreshRelaySession.mockRejectedValue(new Error('refresh window over'));

        await expect(requestSessionRefresh('relay', { manager: makeManager(null) })).resolves.toBe(false);
    });
});
