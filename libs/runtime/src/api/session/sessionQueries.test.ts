import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';
import type { PerfTraceBackend } from '@chatic/perf';

import { coreEngine } from '../../engine/engine';
import { fakeSessionCommands } from '../../engine/testing/sessionCommands';
import type { SessionCommands } from '../../engine';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { cloudsKeys } from '../data/queryKeys';
import {
    SWITCH_CLOUD_MUTATION_KEY,
    SWITCH_SITE_MUTATION_KEY,
    inviteFlowMutation,
    inviteInfoQuery,
    loginMutation,
    loginRelayGuestByDeviceMutation,
    loginRelaySocialMutation,
    logoutCloudSessionMutation,
    siteSwitchMutation,
    switchCloudSessionMutation,
    traceCloudSwitch,
} from './sessionQueries';

const mockFetchInviteInfo = jest.fn();
jest.mock('./authLookups', () => ({
    fetchInviteInfoWithCode: (...args: unknown[]) => mockFetchInviteInfo(...args),
}));

const mockRelayBackend = jest.fn();
jest.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'net.relay.backend' ? mockRelayBackend() : undefined) },
}));

const withCommands = (commands: Partial<SessionCommands>) =>
    initAppRuntime({ ...coreEngine, commands: fakeSessionCommands(commands) });

beforeEach(() => {
    jest.clearAllMocks();
    mockRelayBackend.mockReturnValue('');
    resetPerfTraces();
});

afterEach(() => {
    resetRuntimeEngine();
    resetPerfTraces();
});

describe('inviteInfoQuery', () => {
    it('keys on the code and the endpoint, never caches, and skips the window-focus refetch', () => {
        const query = inviteInfoQuery('invt:1', 'https://cloud', true);

        expect(query.queryKey).toEqual(['inviteInfo', 'invt:1', 'https://cloud']);
        expect(query.staleTime).toBe(0);
        expect(query.refetchOnWindowFocus).toBe(false);
        expect(query.enabled).toBe(true);
    });

    it('falls back to the relay backend when no backend is given', async () => {
        mockRelayBackend.mockReturnValue('https://relay');
        mockFetchInviteInfo.mockResolvedValue({ id: 'invite' });

        const query = inviteInfoQuery('invt:1', undefined, true);

        expect(query.queryKey).toEqual(['inviteInfo', 'invt:1', 'https://relay']);
        await expect(query.queryFn()).resolves.toEqual({ id: 'invite' });
        expect(mockFetchInviteInfo).toHaveBeenCalledWith('invt:1', 'https://relay');
    });

    it('stays off when signed out, with no code, or with no endpoint at all', () => {
        expect(inviteInfoQuery('invt:1', 'https://cloud', false).enabled).toBe(false);
        expect(inviteInfoQuery(null, 'https://cloud', true).enabled).toBe(false);
        expect(inviteInfoQuery('invt:1', undefined, true).enabled).toBe(false);
    });
});

describe('the session mutations', () => {
    it('logs in with the body and the email flag apart, and marks the clouds stale', async () => {
        const loginUser = jest.fn(async () => ({}) as never);
        withCommands({ loginUser });

        await loginMutation.mutationFn({ uid: 'u', password: 'p', email: true } as never);

        expect(loginUser).toHaveBeenCalledWith({ uid: 'u', password: 'p' }, { email: true });
        expect(loginMutation.invalidates).toEqual([cloudsKeys.all]);
    });

    it('passes the relay logins and the cloud logout straight to the engine', async () => {
        const loginGuestByDevice = jest.fn(async () => ({}) as never);
        const loginBySocialToken = jest.fn(async () => ({}) as never);
        const logoutCloud = jest.fn(async () => undefined);
        withCommands({ loginGuestByDevice, loginBySocialToken, logoutCloud });

        await loginRelayGuestByDeviceMutation.mutationFn('device-1');
        await loginRelaySocialMutation.mutationFn({ body: { token: 't' } as never, provider: 'apple' });
        await logoutCloudSessionMutation.mutationFn();

        expect(loginGuestByDevice).toHaveBeenCalledWith('device-1');
        expect(loginBySocialToken).toHaveBeenCalledWith({ token: 't' }, 'apple');
        expect(logoutCloud).toHaveBeenCalledTimes(1);
    });

    it('keys the two switches so a screen can count them in flight', async () => {
        const switchSite = jest.fn(async () => undefined);
        const switchCloud = jest.fn(async () => undefined);
        withCommands({ switchSite, switchCloud });

        expect(siteSwitchMutation.mutationKey).toBe(SWITCH_SITE_MUTATION_KEY);
        expect(switchCloudSessionMutation.mutationKey).toBe(SWITCH_CLOUD_MUTATION_KEY);
        expect(SWITCH_SITE_MUTATION_KEY).toEqual(['session', 'switch-site']);
        expect(SWITCH_CLOUD_MUTATION_KEY).toEqual(['session', 'switch-cloud']);

        await siteSwitchMutation.mutationFn('site-1');
        await switchCloudSessionMutation.mutationFn({ cloudId: 'cloud-1' });
        await switchCloudSessionMutation.mutationFn({
            cloudId: 'cloud-2',
            inviteLogin: { handle: 'h', cloudId: 'cloud-2' } as never,
        });

        expect(switchSite).toHaveBeenCalledWith('site-1');
        expect(switchCloud).toHaveBeenNthCalledWith(1, 'cloud-1', undefined);
        expect(switchCloud).toHaveBeenNthCalledWith(2, 'cloud-2', { inviteLogin: { handle: 'h', cloudId: 'cloud-2' } });
    });

    it('runs the invite login for the delegator, and refuses without one', async () => {
        const loginWithInviteCode = jest.fn(async () => ({ handle: 'h', cloudId: 'c' }) as never);
        withCommands({ loginWithInviteCode });

        await expect(inviteFlowMutation('delegator-1').mutationFn({ code: 'INVITE', backend: 'b' })).resolves.toEqual({
            handle: 'h',
            cloudId: 'c',
        });
        expect(loginWithInviteCode).toHaveBeenCalledWith('INVITE', 'delegator-1', 'b');

        await expect(inviteFlowMutation(null).mutationFn({ code: 'INVITE' })).rejects.toThrow('No delegatorId');
        expect(loginWithInviteCode).toHaveBeenCalledTimes(1);
    });
});

describe('traceCloudSwitch', () => {
    const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

    it('records one cloud_switch trace with outcome ok', async () => {
        configurePerfTraces(backend);

        await traceCloudSwitch(async () => 'done');

        expect(backend.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'cloud_switch' }));
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'cloud_switch', attributes: { outcome: 'ok' } })
        );
    });

    it('records outcome error and rethrows', async () => {
        configurePerfTraces(backend);

        await expect(
            traceCloudSwitch(async () => {
                throw new Error('exchange failed');
            })
        ).rejects.toThrow('exchange failed');
        expect(backend.stop).toHaveBeenCalledWith(expect.objectContaining({ attributes: { outcome: 'error' } }));
    });
});
