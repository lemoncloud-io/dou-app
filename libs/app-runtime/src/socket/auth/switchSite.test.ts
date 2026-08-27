import { configurePerfMetrics, resetPerfMetrics } from '@chatic/bridges';
import { switchSite } from './switchSite';
import { applySelectedSite, getGlobalSessionContext, getSelectedSiteId } from '@chatic/web-core';
import { getSocketManager } from '../runtime';

import type { Logger } from '@chatic/bridges';

jest.mock('@chatic/web-core', () => ({
    applySelectedSite: jest.fn(),
    getGlobalSessionContext: jest.fn(),
    getSelectedSiteId: jest.fn(),
}));

jest.mock('../runtime', () => ({
    getSocketManager: jest.fn(),
}));

const mockedApply = applySelectedSite as jest.MockedFunction<typeof applySelectedSite>;
const mockedGetSelected = getSelectedSiteId as jest.MockedFunction<typeof getSelectedSiteId>;
const mockedGetSession = getGlobalSessionContext as jest.MockedFunction<typeof getGlobalSessionContext>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

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

    it('throws without touching the sid when there is no active user', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser(null);

        await expect(switchSite('site-new')).rejects.toThrow('no active user id');
        expect(mockedApply).not.toHaveBeenCalled();
    });
});

describe('switchSiteViaSocket — site-switch budget (ADR-0071)', () => {
    const perfLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
    });

    afterEach(() => resetPerfMetrics());

    it('reports nothing for the same-site no-op — those would be ~0ms samples deflating the p95', async () => {
        mockedGetSelected.mockReturnValue('site-1');

        await switchSite('site-1');

        expect(perfLogger.info).not.toHaveBeenCalled();
    });

    it('reports nothing when there is no active user — nothing was measured', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser(null);

        await expect(switchSite('site-new')).rejects.toThrow('no active user id');
        expect(perfLogger.info).not.toHaveBeenCalled();
    });

    it('reports one ok sample on success', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockResolvedValue(undefined)));

        await switchSite('site-new');

        expect(perfLogger.info).toHaveBeenCalledTimes(1);
        expect(perfLogger.info).toHaveBeenCalledWith(
            'PERF',
            expect.stringMatching(/^site-switch \d+ms$/),
            expect.objectContaining({ metric: 'site-switch', budgetMs: 1000, ok: true })
        );
    });

    it('reports a failed switch too, flagged ok:false', async () => {
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockRejectedValue(new Error('server rejected'))));

        await expect(switchSite('site-new')).rejects.toThrow('server rejected');

        expect(perfLogger.info).toHaveBeenCalledTimes(1);
        expect(perfLogger.info).toHaveBeenCalledWith(
            'PERF',
            expect.any(String),
            expect.objectContaining({ metric: 'site-switch', ok: false })
        );
    });

    it('reports nothing on an unconfigured host (desktop-web, plain browser)', async () => {
        resetPerfMetrics();
        mockedGetSelected.mockReturnValue('site-old');
        withUser('user-1');
        mockedGetManager.mockReturnValue(makeManager(jest.fn().mockResolvedValue(undefined)));

        await switchSite('site-new');

        expect(perfLogger.info).not.toHaveBeenCalled();
    });
});
