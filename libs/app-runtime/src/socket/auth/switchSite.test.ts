import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';
import { switchSite } from './switchSite';
import { cloudSession } from '../../session/auth/cloudSession';
import { getGlobalSessionContext, getSelectedSiteId } from '../../session/store';
import { getSocketManager } from '../runtime';
import { handleRevokedRelaySession } from './revokedSession';

import type { PerfTraceBackend } from '@chatic/perf';

// Mocked at the CONCRETE modules, not the session barrel: these three are runtime-internal and off
// that barrel now (ADR-0076 Decision 6).
jest.mock('../../session/auth/cloudSession', () => ({ cloudSession: { applySelectedSite: jest.fn() } }));
jest.mock('../../session/store', () => ({
    getGlobalSessionContext: jest.fn(),
    getSelectedSiteId: jest.fn(),
}));

jest.mock('../runtime', () => ({
    getSocketManager: jest.fn(),
}));

// Only the TEARDOWN is stubbed (it redirects the document). The predicate stays real so these cases
// exercise the actual matcher against the actual SDK error shape.
jest.mock('./revokedSession', () => ({
    ...jest.requireActual('./revokedSession'),
    handleRevokedRelaySession: jest.fn().mockResolvedValue(undefined),
}));

const mockedApply = cloudSession.applySelectedSite as jest.Mock;
const mockedGetSelected = getSelectedSiteId as jest.MockedFunction<typeof getSelectedSiteId>;
const mockedGetSession = getGlobalSessionContext as jest.MockedFunction<typeof getGlobalSessionContext>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;
const mockedHandleRevoked = handleRevokedRelaySession as jest.Mock;

const makeManager = (authSwitch: jest.Mock, waitUntilVerified = jest.fn().mockResolvedValue(true)) =>
    ({
        waitUntilVerified,
        getClient: jest.fn(() => ({ auth: { switch: authSwitch } })),
    }) as never;

const withUser = (userId: string | null) =>
    mockedGetSession.mockReturnValue({ identity: { userId } } as ReturnType<typeof getGlobalSessionContext>);

describe('switchSiteViaSocket', () => {
    beforeEach(() => jest.clearAllMocks());

    it('no-ops when switching to the already-selected site', async () => {
        mockedGetSelected.mockReturnValue('site-1');

        await switchSite('site-1');

        expect(mockedApply).not.toHaveBeenCalled();
        expect(mockedGetSession).not.toHaveBeenCalled();
    });

    it('optimistically applies the sid then auth.switch(uid@sid) on success (no rollback)', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        const authSwitch = jest.fn().mockResolvedValue(undefined);
        const manager = makeManager(authSwitch);
        mockedGetManager.mockReturnValue(manager);

        await switchSite('site-new');

        expect(mockedApply).toHaveBeenCalledTimes(1);
        expect(mockedApply).toHaveBeenCalledWith('site-new'); // optimistic, no rollback
        expect(authSwitch).toHaveBeenCalledWith('user-1@site-new');
    });

    it('rolls the sid back to the previous site and rethrows when auth.switch fails', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        const authSwitch = jest.fn().mockRejectedValue(new Error('server rejected'));
        mockedGetManager.mockReturnValue(makeManager(authSwitch));

        await expect(switchSite('site-new')).rejects.toThrow('server rejected');

        const applied = mockedApply.mock.calls.map(c => c[0]);
        expect(applied).toEqual(['site-new', 'site-old']); // optimistic then rollback
    });

    it('ends the session when the server answers that it is revoked', async () => {
        // The live failure (.claude/20260910/DEBUG-17-30-25.md): the session was revoked server-side,
        // so nothing this client holds works again — a rollback + rethrow alone leaves the app
        // authenticated-looking and 403-ing on every screen.
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        const rejection = new Error('auth.switch failed: server') as Error & { cause?: unknown };
        rejection.cause = new Error('403 NOT ALLOWED - session revoked @refreshAccessToken(auth-1)');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockRejectedValue(rejection)));

        await expect(switchSite('site-new')).rejects.toThrow('auth.switch failed: server');

        expect(mockedHandleRevoked).toHaveBeenCalledWith('auth.switch');
        // The caller still gets its rollback — the teardown is not a substitute for it.
        expect(mockedApply.mock.calls.map(c => c[0])).toEqual(['site-new', 'site-old']);
    });

    it('leaves the session alone for a recoverable switch failure', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockRejectedValue(new Error('server rejected'))));

        await expect(switchSite('site-new')).rejects.toThrow('server rejected');

        expect(mockedHandleRevoked).not.toHaveBeenCalled();
    });

    it('throws without touching the sid when there is no active user', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser(null);

        await expect(switchSite('site-new')).rejects.toThrow('no active user id');
        expect(mockedApply).not.toHaveBeenCalled();
    });
});

describe('switchSiteViaSocket — site_switch trace', () => {
    const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

    beforeEach(() => {
        jest.clearAllMocks();
        configurePerfTraces(backend);
    });

    afterEach(() => resetPerfTraces());

    it('records nothing for the same-site no-op — those would be ~0ms samples deflating the p95', async () => {
        mockedGetSelected.mockReturnValue('site-1');

        await switchSite('site-1');

        expect(backend.start).not.toHaveBeenCalled();
    });

    it('records nothing when there is no active user — nothing was measured', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser(null);

        await expect(switchSite('site-new')).rejects.toThrow('no active user id');
        expect(backend.start).not.toHaveBeenCalled();
    });

    it('records one trace with outcome ok on success', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockResolvedValue(undefined)));

        await switchSite('site-new');

        expect(backend.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'site_switch' }));
        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'site_switch', attributes: { outcome: 'ok' } })
        );
    });

    it('marks when the socket was verified, so the wait and the auth.switch can be told apart', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockResolvedValue(undefined)));

        await switchSite('site-new');

        expect(backend.stop.mock.calls[0][0].metrics).toHaveProperty('verified');
    });

    it('leaves no verified mark when the wait for the socket timed out', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        const authSwitch = jest.fn().mockRejectedValue(new Error('not-connected'));
        mockedGetManager.mockReturnValue(makeManager(authSwitch, jest.fn().mockResolvedValue(false)));

        await expect(switchSite('site-new')).rejects.toThrow('not-connected');

        expect(backend.stop.mock.calls[0][0].metrics).not.toHaveProperty('verified');
    });

    it('records a failed switch too, with outcome error', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockRejectedValue(new Error('server rejected'))));

        await expect(switchSite('site-new')).rejects.toThrow('server rejected');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(expect.objectContaining({ attributes: { outcome: 'error' } }));
    });
});
