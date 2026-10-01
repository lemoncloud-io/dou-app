import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';

import type { DomainCloud } from '@chatic/data';

import type { InviteContext } from './types';

/**
 * The cloud invite acceptance, wired as the app wires it: the accept pipeline (`useInviteAccept` and
 * its three entry steps), the invited-cloud list (`useInvitedClouds` → `useJoinedCloudIds`) and the
 * pending-room store are all the real modules. What is faked is everything past the app's edge — the
 * server, the device's shared cloud cache and the session — and the fake server follows the rules
 * measured against production on 2026-10-01, because those rules are what made acceptance fail:
 *
 * - `login-invite` binds the invite's member to the device guest it names (`delegatorId`) and answers
 *   with that member's own cloud token.
 * - `delegate-cloud` answers for the relay user as it is now — the guest, or the account it signed in
 *   to — and mints an EMPTY user, a member of nothing, for one it has never seen in that cloud.
 *
 * So an entry re-issued through `delegate-cloud` lands on the invitee only when the relay user is the
 * guest the invite bound and has not been in the cloud before. A signed-in device, or a guest whose
 * background socket delegated first, lands on a user with no rooms, and every room answers 403.
 */

interface Invite {
    cloudId: string;
    channelId: string;
    memberUid: string;
}

class FakeCloudServer {
    private readonly bindings = new Map<string, string>();
    private readonly members = new Map<string, Set<string>>();
    private readonly invites = new Map<string, Invite>();
    private nextUid = 2000;
    /** Relay-signed calls that fail with no HTTP answer, as on a cold start with a stale credential. */
    networkFailuresLeft = 0;
    /** An invite login whose answer carries no identity token, so the entry falls back to a re-issue. */
    answersWithoutToken = false;

    issueInvite(code: string, cloudId: string, channelId: string): void {
        // The server creates the invitee's user and its room membership when the invite is issued.
        const memberUid = this.mintUid();
        this.membersOf(channelId).add(memberUid);
        this.invites.set(code, { cloudId, channelId, memberUid });
    }

    loginInvite(code: string, delegatorId: string | null): { id: string; Token: { identityToken: string } } {
        const invite = this.invites.get(code);
        if (!invite) throw new Error('400 INVALID - no such invite');
        if (!delegatorId) throw new Error('No delegatorId for invite flow');
        const key = this.key(invite.cloudId, delegatorId);
        if (!this.bindings.has(key)) this.bindings.set(key, invite.memberUid);
        if (this.answersWithoutToken) return { id: invite.memberUid, Token: {} };
        return { id: invite.memberUid, Token: { identityToken: `idt:${invite.memberUid}` } };
    }

    /** `signer` is the relay user the call is signed as — the guest, or the account it signed in to. */
    delegate(cloudId: string, signer: string): string {
        if (this.networkFailuresLeft > 0) {
            this.networkFailuresLeft -= 1;
            throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        }
        const key = this.key(cloudId, signer);
        if (!this.bindings.has(key)) this.bindings.set(key, this.mintUid());
        return this.bindings.get(key) as string;
    }

    hasUserFor(cloudId: string, signer: string): boolean {
        return this.bindings.has(this.key(cloudId, signer));
    }

    canRead(channelId: string, uid: string | undefined): boolean {
        return !!uid && this.membersOf(channelId).has(uid);
    }

    private membersOf(channelId: string): Set<string> {
        if (!this.members.has(channelId)) this.members.set(channelId, new Set());
        return this.members.get(channelId) as Set<string>;
    }

    private mintUid(): string {
        return String((this.nextUid += 1));
    }

    private key(cloudId: string, guest: string): string {
        return `${cloudId}|${guest}`;
    }
}

/** One device: a cloud cache every guest on it shares, and the session of whoever uses it now. */
class FakeDevice {
    /** The device guest — `delegatorId`, written at the first launch and kept after a sign-in. */
    guest = 'guest-1';
    /** Who the relay session is now: the guest, until it signs in to an account. */
    relayUser = 'guest-1';
    selectedCloudId: string | null = null;
    committedUid: string | undefined;
    private readonly rows = new Map<string, DomainCloud>();
    private readonly listeners = new Set<(result: { list: DomainCloud[] }) => void>();

    readonly cloudRepository = {
        cacheRead: async (id: string): Promise<DomainCloud | null> => this.rows.get(id) ?? null,
        cacheWrite: async (item: Partial<DomainCloud>): Promise<void> => {
            const id = item.id as string;
            this.rows.set(id, { ...(this.rows.get(id) ?? ({} as DomainCloud)), ...item } as DomainCloud);
            this.emit();
        },
        observeList: (callback: (result: { list: DomainCloud[] }) => void): (() => void) => {
            this.listeners.add(callback);
            callback({ list: [...this.rows.values()] });
            return () => this.listeners.delete(callback);
        },
    };

    /** A new guest on the same device — a new web tab, say. The cache stays; the session does not. */
    startGuest(guest: string): void {
        this.guest = guest;
        this.relayUser = guest;
        this.selectedCloudId = null;
        this.committedUid = undefined;
    }

    /** The guest signs in: the relay session becomes the account, `delegatorId` stays the guest. */
    signIn(account: string): void {
        this.relayUser = account;
    }

    private emit(): void {
        const list = [...this.rows.values()];
        this.listeners.forEach(listener => listener({ list }));
    }
}

let mockServer = new FakeCloudServer();
let mockDevice = new FakeDevice();
const mockEnterStack = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ cloud: mockDevice.cloudRepository }),
        },
        session: {
            useSessionIdentity: () => ({ delegatorId: mockDevice.guest }),
            useInviteFlow: () => ({
                runInviteFlow: async ({ code }: { code: string }) => mockServer.loginInvite(code, mockDevice.guest),
                isInviting: false,
            }),
            useSwitchCloudSession: () => ({
                // The runtime's two entries: with an invite login's answer, that answer is committed as
                // it is; without one, the cloud is re-issued through `delegate-cloud`.
                switchCloud: async (
                    cloudId: string,
                    options?: { inviteLogin?: { cloudToken?: { id?: string; Token?: { identityToken?: string } } } }
                ) => {
                    const answer = options?.inviteLogin?.cloudToken;
                    const invitee = answer?.Token?.identityToken ? answer.id : undefined;
                    mockDevice.committedUid = invitee ?? mockServer.delegate(cloudId, mockDevice.relayUser);
                    mockDevice.selectedCloudId = cloudId;
                },
                isPending: false,
            }),
            useSessionSelection: () => ({ selectedCloudId: mockDevice.selectedCloudId }),
        },
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
// Edges the scenario does not cross: owned clouds come from the relay catalog, the place switch has
// its own suites, and navigation is only observed.
jest.mock('../../../hooks/useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ clouds: [] }) }));
jest.mock('../../../runtime/useSiteSwitch', () => ({
    useSiteSwitch: () => ({ switchSite: async () => undefined, isSwitching: false }),
}));
jest.mock('../../../navigation', () => ({ useStackNavigate: () => mockEnterStack }));

const { useInviteAccept } = require('./hooks/useInviteAccept');
const { useInvitedClouds } = require('../../../hooks/useInvitedClouds');
const { useJoinedCloudIds } = require('../../../hooks/useJoinedCloudIds');
const { usePendingInviteChannel } = require('../../../stores/usePendingInviteChannel');

const CLOUD = 'cloud-1';

const inviteContext = (code: string, channelId: string): InviteContext =>
    ({
        params: { code, backend: 'https://cloud.example' },
        info: {
            cloudId: CLOUD,
            cloudName: 'Test Cloud',
            channelId,
            $envs: { backend: 'https://cloud.example', wss: 'wss://cloud.example' },
        },
    }) as InviteContext;

/**
 * What the runtime's background sockets do with the app's cloud list: delegate into every cloud in
 * it. Mirrors `BackgroundCloudsRunner`, which hands `useJoinedCloudIds(owned, invited)` to the runtime.
 */
const useBackgroundDelegation = (): readonly string[] => {
    const { invitedClouds } = useInvitedClouds();
    const joined = useJoinedCloudIds([], invitedClouds);
    useEffect(() => {
        joined.forEach((cloudId: string) => mockServer.delegate(cloudId, mockDevice.relayUser));
    }, [joined]);
    return joined;
};

const acceptInvite = async (context: InviteContext) => {
    const { result } = renderHook(() => useInviteAccept(context));
    await act(async () => {
        await result.current.accept();
    });
    return result;
};

describe('cloud invite acceptance (integration)', () => {
    beforeEach(() => {
        mockServer = new FakeCloudServer();
        mockDevice = new FakeDevice();
        mockEnterStack.mockClear();
        usePendingInviteChannel.getState().clearPendingChannel();
    });

    it('lands a fresh guest in the invited room as the invite member', async () => {
        mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');

        const result = await acceptInvite(inviteContext('invt:1:a', 'room-1'));

        expect(result.current.errorKey).toBeNull();
        expect(mockDevice.selectedCloudId).toBe(CLOUD);
        expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);
        expect(usePendingInviteChannel.getState().channelId).toBe('room-1');
    });

    it('does not delegate a new guest into a cloud another guest on the device accepted', async () => {
        // The first guest on this device accepts an invite into the cloud.
        mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');
        await acceptInvite(inviteContext('invt:1:a', 'room-1'));

        // A second guest starts on the same device, with an invite of its own still unopened.
        mockDevice.startGuest('guest-2');
        mockServer.issueInvite('invt:2:b', CLOUD, 'room-1');
        const background = renderHook(() => useBackgroundDelegation());

        expect(background.result.current).not.toContain(CLOUD);
        expect(mockServer.hasUserFor(CLOUD, 'guest-2')).toBe(false);

        // Accepting binds the invite member to this guest, so it can read the room it was invited to.
        const result = await acceptInvite(inviteContext('invt:2:b', 'room-1'));
        expect(result.current.errorKey).toBeNull();
        expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);

        // Once it has accepted, the cloud is this guest's too, and background sockets may keep it.
        background.rerender();
        expect(background.result.current).toContain(CLOUD);
    });

    it('lands a guest that signed in to an account in the invited room as the invite member', async () => {
        mockDevice.signIn('account-1');
        mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');

        const result = await acceptInvite(inviteContext('invt:1:a', 'room-1'));

        expect(result.current.errorKey).toBeNull();
        expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);
    });

    it('lands the invite member even when a background socket delegated into the cloud first', async () => {
        // A row written before acceptors were recorded is listed for every guest, so the background
        // sockets delegate into its cloud before Accept — minting an empty user for this guest.
        await mockDevice.cloudRepository.cacheWrite({ id: CLOUD, cid: CLOUD, cloudType: 'invited' });
        renderHook(() => useBackgroundDelegation());
        expect(mockServer.hasUserFor(CLOUD, 'guest-1')).toBe(true);

        mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');
        const result = await acceptInvite(inviteContext('invt:1:a', 'room-1'));

        expect(result.current.errorKey).toBeNull();
        expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);
    });

    it('falls back to a re-issue it retries while the network is not answering yet', async () => {
        jest.useFakeTimers();
        try {
            mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');
            mockServer.answersWithoutToken = true;
            mockServer.networkFailuresLeft = 2;
            const { result } = renderHook(() => useInviteAccept(inviteContext('invt:1:a', 'room-1')));

            let accepted: Promise<void> = Promise.resolve();
            await act(async () => {
                accepted = result.current.accept();
                await jest.advanceTimersByTimeAsync(1000 + 2000);
                await accepted;
            });

            expect(result.current.errorKey).toBeNull();
            expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);
            expect(usePendingInviteChannel.getState().channelId).toBe('room-1');
        } finally {
            jest.useRealTimers();
        }
    });
});
