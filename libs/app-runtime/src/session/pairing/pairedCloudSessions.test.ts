import { setStorageAdapter } from '@chatic/shared';

import { alignSessionSite } from '../../socket/auth/alignSessionSite';
import { credentialRenewers } from '../../socket/auth/renewers';
import { reauthenticateActiveSocket } from '../../socket/auth/reauthenticateActiveSocket';
import { isExchangeInFlight, issueCloudTokens, reissueCloudTokens } from '../auth/cloudTokens';
import { cloudStore } from '../store/stores';
import { pairedClouds } from './pairedClouds';
import {
    PairedCloudSessions,
    forgetRefusedPairedCloud,
    isRefusedForEndedPairing,
    pairedCloudSessions,
    type PairedCloudSessionsDeps,
} from './pairedCloudSessions';

// The wired instance pulls the socket runtime in; nothing here reaches it.
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../socket/auth/alignSessionSite', () => ({ alignSessionSite: jest.fn() }));
jest.mock('../../socket/auth/renewers', () => ({ credentialRenewers: { forSlot: jest.fn() } }));
jest.mock('../../socket/auth/reauthenticateActiveSocket', () => ({ reauthenticateActiveSocket: jest.fn() }));
jest.mock('../../socket/auth/reauthDelegate', () => ({ createReauthDelegate: jest.fn() }));
jest.mock('../../socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('../auth/cloudTokens', () => ({
    isExchangeInFlight: jest.fn(),
    issueCloudTokens: jest.fn(),
    reissueCloudTokens: jest.fn(),
}));

const refusal = (reason: string, status = 403) =>
    Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: reason } });
const revoked = () => refusal('403 NOT ALLOWED - pairing revoked @doPostDelegateCloud(users/0)');

/** A lifecycle over an in-memory list, recording every call in order. */
const harness = (initial: string[] = []) => {
    const ids = [...initial];
    const calls: string[] = [];
    const deps = {
        clouds: {
            list: () => [...ids],
            has: (id: string) => ids.includes(id),
            add: jest.fn((id: string) => {
                calls.push(`add:${id}`);
                if (!ids.includes(id)) ids.push(id);
            }),
            remove: jest.fn((id: string) => {
                calls.push(`remove:${id}`);
                ids.splice(ids.indexOf(id), 1);
            }),
        },
        dropIdentity: jest.fn((id: string) => void calls.push(`drop:${id}`)),
        reissue: jest.fn(async (id: string): Promise<{ landedSiteId?: string }> => {
            calls.push(`reissue:${id}`);
            return { landedSiteId: 'site-landed' };
        }),
        settleExchangeInFlight: jest.fn(async (id: string) => void calls.push(`settle:${id}`)),
        reauthenticate: jest.fn(async (id: string) => void calls.push(`reauth:${id}`)),
        alignSite: jest.fn(async (id: string) => void calls.push(`align:${id}`)),
        tearDown: jest.fn((id: string) => void calls.push(`teardown:${id}`)),
    } satisfies PairedCloudSessionsDeps;
    const switchCloud = jest.fn(async (id: string) => void calls.push(`switch:${id}`));
    return { sessions: new PairedCloudSessions(deps), deps, calls, ids, switchCloud };
};

describe('isRefusedForEndedPairing', () => {
    it.each([
        '403 NOT ALLOWED - pairing revoked @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - pairing not found @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - approver session revoked @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - approver banned @doPostDelegateCloud(users/0)',
    ])('recognises the relay refusing over an ended pairing: %s', reason => {
        expect(isRefusedForEndedPairing(refusal(reason))).toBe(true);
    });

    it.each([
        ['another 403', refusal('403 NOT ALLOWED - not a member')],
        ['a 403 for stale relay credentials', refusal('The security token included in the request is expired')],
        ['the same words on another status', refusal('pairing revoked', 400)],
        ['a network error', new Error('Network Error')],
    ])('is false for %s', (_label, error) => {
        expect(isRefusedForEndedPairing(error)).toBe(false);
    });
});

describe('PairedCloudSessions.end', () => {
    it("drops the cloud from the list and forgets the approver's uid recorded there", () => {
        const { sessions, calls, ids } = harness(['1000002', '1000009']);

        sessions.end('1000002');

        expect(ids).toEqual(['1000009']);
        expect(calls).toEqual(['remove:1000002', 'drop:1000002']);
    });
});

describe('PairedCloudSessions.forgetRefused', () => {
    it('ends a paired cloud the relay refused over an ended pairing', () => {
        const { sessions, ids, deps } = harness(['1000002']);

        expect(sessions.forgetRefused('1000002', revoked())).toBe(true);
        expect(ids).toEqual([]);
        expect(deps.dropIdentity).toHaveBeenCalledWith('1000002');
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', refusal('', 502)],
        ['a 403 that says nothing of the pairing (stale relay credentials)', refusal('The security token is expired')],
    ])('keeps it after %s', (_label, error) => {
        const { sessions, ids } = harness(['1000002']);

        expect(sessions.forgetRefused('1000002', error)).toBe(false);
        expect(ids).toEqual(['1000002']);
    });

    it('leaves a cloud that was never paired alone', () => {
        const { sessions, deps } = harness(['1000002']);

        expect(sessions.forgetRefused('1000004', revoked())).toBe(false);
        expect(deps.dropIdentity).not.toHaveBeenCalled();
    });
});

describe('PairedCloudSessions.reissue', () => {
    it('re-registers the socket and brings the committed cloud back to the selected place', async () => {
        const { sessions, calls, deps } = harness();

        await sessions.reissue('1000002');

        expect(calls).toEqual(['reissue:1000002', 'reauth:1000002', 'align:1000002']);
        expect(deps.alignSite).toHaveBeenCalledWith('1000002', 'site-landed');
    });

    it('does not fail when the socket cannot re-register', async () => {
        const { sessions, deps } = harness();
        deps.reauthenticate.mockRejectedValueOnce(new Error('socket down'));

        await expect(sessions.reissue('1000002')).resolves.toBeUndefined();
        expect(deps.alignSite).toHaveBeenCalled();
    });

    it('throws when the relay refuses the re-issue, touching nothing else', async () => {
        const { sessions, deps } = harness();
        deps.reissue.mockRejectedValueOnce(revoked());

        await expect(sessions.reissue('1000002')).rejects.toMatchObject({ response: { status: 403 } });
        expect(deps.reauthenticate).not.toHaveBeenCalled();
    });
});

describe('PairedCloudSessions.enter', () => {
    it('settles an exchange already on the wire, re-issues, remembers the cloud, then switches', async () => {
        const { sessions, calls, switchCloud } = harness();

        await sessions.enter('1000004', switchCloud);

        expect(calls).toEqual([
            'settle:1000004',
            'reissue:1000004',
            'reauth:1000004',
            'align:1000004',
            'add:1000004',
            'switch:1000004',
        ]);
    });

    it('neither switches nor remembers the cloud when the relay refuses the delegation', async () => {
        const { sessions, deps, switchCloud } = harness();
        deps.reissue.mockRejectedValueOnce(revoked());

        await expect(sessions.enter('1000004', switchCloud)).rejects.toMatchObject({ response: { status: 403 } });
        expect(switchCloud).not.toHaveBeenCalled();
        expect(deps.clouds.add).not.toHaveBeenCalled();
    });

    it("keeps the cloud on the list when the switch fails — the tab holds the approver's tokens for it", async () => {
        const { sessions, ids, switchCloud } = harness();
        switchCloud.mockRejectedValueOnce(new Error('switch failed'));

        await expect(sessions.enter('1000004', switchCloud)).rejects.toThrow('switch failed');
        expect(ids).toEqual(['1000004']);
    });
});

describe('PairedCloudSessions.check', () => {
    it('keeps a cloud the relay still delegates', async () => {
        const { sessions, ids, deps } = harness(['1000002']);

        await expect(sessions.check('1000002')).resolves.toBe('kept');
        expect(deps.reauthenticate).toHaveBeenCalledWith('1000002');
        expect(ids).toEqual(['1000002']);
    });

    it('ends a cloud the relay refuses over an ended pairing: tears it down, then ends it', async () => {
        const { sessions, calls, deps } = harness(['1000002']);
        deps.reissue.mockRejectedValueOnce(revoked());

        await expect(sessions.check('1000002')).resolves.toBe('ended');
        expect(calls).toEqual(['teardown:1000002', 'remove:1000002', 'drop:1000002']);
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', refusal('', 502)],
        ['a 403 that says nothing of the pairing (stale relay credentials)', refusal('The security token is expired')],
    ])('changes nothing after %s', async (_label, error) => {
        const { sessions, ids, deps } = harness(['1000002']);
        deps.reissue.mockRejectedValueOnce(error);

        await expect(sessions.check('1000002')).resolves.toBe('unknown');
        expect(deps.tearDown).not.toHaveBeenCalled();
        expect(ids).toEqual(['1000002']);
    });
});

describe('PairedCloudSessions.checkAll', () => {
    it('checks each paired cloud and returns the ones that ended', async () => {
        const { sessions, deps } = harness(['a', 'b', 'c']);
        deps.reissue.mockImplementation(async (id: string) => {
            if (id === 'b') throw revoked();
            return { landedSiteId: undefined };
        });

        await expect(sessions.checkAll()).resolves.toEqual(['b']);
        expect(deps.reissue).toHaveBeenCalledTimes(3);
    });
});

describe('the wired instance', () => {
    const store = new Map<string, string>();
    setStorageAdapter({
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: key => void store.delete(key),
    });
    const onTerminalExpiry = jest.fn();
    const switchCloud = jest.fn(async () => undefined);

    beforeEach(() => {
        store.clear();
        jest.clearAllMocks();
        jest.mocked(isExchangeInFlight).mockReturnValue(false);
        jest.mocked(issueCloudTokens).mockResolvedValue({} as never);
        jest.mocked(reissueCloudTokens).mockResolvedValue({ cloudToken: { $site: { id: 'site-landed' } } } as never);
        jest.mocked(reauthenticateActiveSocket).mockResolvedValue(undefined as never);
        jest.mocked(alignSessionSite).mockResolvedValue(undefined);
        jest.mocked(credentialRenewers.forSlot).mockReturnValue({ onTerminalExpiry } as never);
    });

    it('lets an exchange that began before the approval finish, then re-issues its own', async () => {
        jest.mocked(isExchangeInFlight).mockReturnValue(true);

        await pairedCloudSessions.enter('1000004', switchCloud);

        expect(issueCloudTokens).toHaveBeenCalledWith('1000004', { allowCache: false });
        expect(jest.mocked(issueCloudTokens).mock.invocationCallOrder[0]).toBeLessThan(
            jest.mocked(reissueCloudTokens).mock.invocationCallOrder[0]
        );
        expect(pairedClouds.list()).toEqual(['1000004']);
    });

    it('re-issues even when the exchange it waited for failed', async () => {
        jest.mocked(isExchangeInFlight).mockReturnValue(true);
        jest.mocked(issueCloudTokens).mockRejectedValue(new Error('network'));

        await pairedCloudSessions.enter('1000004', switchCloud);

        expect(reissueCloudTokens).toHaveBeenCalledWith('1000004');
        expect(pairedClouds.list()).toEqual(['1000004']);
    });

    it('waits for nothing when no exchange is on the wire', async () => {
        await pairedCloudSessions.enter('1000004', switchCloud);

        expect(issueCloudTokens).not.toHaveBeenCalled();
    });

    it('aligns the place with the one the re-issued token landed on', async () => {
        await pairedCloudSessions.reissue('1000002');

        expect(reauthenticateActiveSocket).toHaveBeenCalledWith(expect.objectContaining({ slot: '1000002' }));
        expect(alignSessionSite).toHaveBeenCalledWith('1000002', 'site-landed');
    });

    it("tears an ended cloud down through its slot's credential renewer", async () => {
        pairedClouds.add('1000002');
        jest.mocked(reissueCloudTokens).mockRejectedValue(revoked());

        await expect(pairedCloudSessions.check('1000002')).resolves.toBe('ended');
        expect(credentialRenewers.forSlot).toHaveBeenCalledWith('1000002');
        expect(onTerminalExpiry).toHaveBeenCalledTimes(1);
        expect(pairedClouds.list()).toEqual([]);
    });

    it('ends the stored paired cloud and its recorded uid in the real stores', () => {
        pairedClouds.add('1000002');
        cloudStore.setCloudIdentity('1000002', { uid: 'approver' });
        cloudStore.setCloudIdentity('1000009', { uid: 'mine' });

        expect(forgetRefusedPairedCloud('1000002', revoked())).toBe(true);
        expect(pairedClouds.list()).toEqual([]);
        expect(cloudStore.getCloudIdentities()).toEqual({ '1000009': { uid: 'mine' } });
    });
});
