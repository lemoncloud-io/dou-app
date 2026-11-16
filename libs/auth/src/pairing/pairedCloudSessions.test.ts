import { sessionStores } from '@chatic/session/store/ports';

import { alignSessionSite } from '../socket/alignSessionSite';
import { credentialRenewers } from '../socket/renewers';
import { reauthenticateActiveSocket } from '../socket/reauthenticateActiveSocket';
import { isExchangeInFlight, issueCloudTokens, reissueCloudTokens } from '../session/cloudTokens';
import { cloudStore } from '@chatic/session/store/stores';
import { pairedClouds } from './pairedClouds';
import {
    PairedCloudSessions,
    checkPairedClouds,
    endPairedCloud,
    isRefusedForEndedPairing,
    pairedCloudSessions,
    type PairedCloudSessionsDeps,
} from './pairedCloudSessions';

// The wired instance pulls the socket runtime in; nothing here reaches it.
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../socket/alignSessionSite', () => ({ alignSessionSite: jest.fn() }));
jest.mock('../socket/renewers', () => ({ credentialRenewers: { forSlot: jest.fn() } }));
jest.mock('../socket/reauthenticateActiveSocket', () => ({ reauthenticateActiveSocket: jest.fn() }));
jest.mock('../socket/reauthDelegate', () => ({ createReauthDelegate: jest.fn() }));
jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: jest.fn() }));
const mockIsRelayGuest = jest.fn(() => true);
jest.mock('./pairedSession', () => ({ isRelayGuest: () => mockIsRelayGuest() }));
jest.mock('../session/cloudTokens', () => ({
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

describe('PairedCloudSessions.prepareEntry', () => {
    it("settles an exchange on the wire, forgets the tab's own uid, re-issues, then remembers the cloud", async () => {
        const { sessions, calls, switchCloud } = harness();

        await sessions.prepareEntry('1000004');

        // The drop sits between the settle and the re-issue: an exchange refuses to move a cloud off its
        // recorded uid, and the approver's uid replacing the tab's own is what entering is for.
        expect(calls).toEqual([
            'settle:1000004',
            'drop:1000004',
            'reissue:1000004',
            'reauth:1000004',
            'align:1000004',
            'add:1000004',
        ]);
        // The caller switches its own way.
        expect(switchCloud).not.toHaveBeenCalled();
    });

    it('does not remember the cloud when the relay refuses the delegation', async () => {
        const { sessions, deps } = harness();
        deps.reissue.mockRejectedValueOnce(revoked());

        await expect(sessions.prepareEntry('1000004')).rejects.toMatchObject({ response: { status: 403 } });
        expect(deps.clouds.add).not.toHaveBeenCalled();
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
    const map = new Map<string, string>();
    // One map behind both session ports — these tests are about the list, not which port holds it.
    const store = {
        get: (key: string) => map.get(key) ?? null,
        set: (key: string, value: string) => void map.set(key, value),
        remove: (key: string) => void map.delete(key),
        clear: () => map.clear(),
        keys: () => [...map.keys()],
    };
    sessionStores.configure({ secret: store, plain: store });
    const onTerminalExpiry = jest.fn();

    beforeEach(() => {
        map.clear();
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

        await pairedCloudSessions.prepareEntry('1000004');

        expect(issueCloudTokens).toHaveBeenCalledWith('1000004', { allowCache: false });
        expect(jest.mocked(issueCloudTokens).mock.invocationCallOrder[0]).toBeLessThan(
            jest.mocked(reissueCloudTokens).mock.invocationCallOrder[0]
        );
        expect(pairedClouds.list()).toEqual(['1000004']);
    });

    it('re-issues even when the exchange it waited for failed', async () => {
        jest.mocked(isExchangeInFlight).mockReturnValue(true);
        jest.mocked(issueCloudTokens).mockRejectedValue(new Error('network'));

        await pairedCloudSessions.prepareEntry('1000004');

        expect(reissueCloudTokens).toHaveBeenCalledWith('1000004');
        expect(pairedClouds.list()).toEqual(['1000004']);
    });

    it('waits for nothing when no exchange is on the wire', async () => {
        await pairedCloudSessions.prepareEntry('1000004');

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

        expect(endPairedCloud('1000002')).toBe(true);
        expect(pairedClouds.list()).toEqual([]);
        expect(cloudStore.getCloudIdentities()).toEqual({ '1000009': { uid: 'mine' } });
    });

    it('checks nothing when no cloud is paired', async () => {
        await expect(checkPairedClouds()).resolves.toEqual([]);
        expect(reissueCloudTokens).not.toHaveBeenCalled();
    });

    it('re-checks every paired cloud of a guest and returns the ones that ended', async () => {
        pairedClouds.add('1000002');
        pairedClouds.add('1000003');
        jest.mocked(reissueCloudTokens).mockImplementation(async cloudId => {
            if (cloudId === '1000002') throw revoked();
            return { cloudToken: { $site: { id: 'site-landed' } } } as never;
        });

        await expect(checkPairedClouds()).resolves.toEqual(['1000002']);
        expect(pairedClouds.list()).toEqual(['1000003']);
    });

    it("ends a signed-in device's guest-era clouds instead of checking them, and reports nothing ended", async () => {
        pairedClouds.add('1000002');
        pairedClouds.add('1000004');
        cloudStore.setCloudIdentity('1000002', { uid: 'approver' });
        mockIsRelayGuest.mockReturnValueOnce(false);

        await expect(checkPairedClouds()).resolves.toEqual([]);
        expect(reissueCloudTokens).not.toHaveBeenCalled();
        expect(pairedClouds.list()).toEqual([]);
        // Ended, not just cleared: the approver's uid goes too, or the account's own entry would be
        // refused as a change of user.
        expect(cloudStore.getCloudIdentities()).not.toHaveProperty('1000002');
    });

    it('ends a paired cloud it is told is over, and says whether there was one', () => {
        pairedClouds.add('1000002');

        expect(endPairedCloud('1000002')).toBe(true);
        expect(pairedClouds.list()).toEqual([]);
        expect(endPairedCloud('1000002')).toBe(false);
    });
});
