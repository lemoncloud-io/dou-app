import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';

import type { DomainCloud } from '@chatic/runtime';

import type { InviteContext } from './types';

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
    networkFailuresLeft = 0;
    answersWithoutToken = false;

    issueInvite(code: string, cloudId: string, channelId: string): void {
        const memberUid = this.mintUid();
        this.membersOf(channelId).add(memberUid);
        this.invites.set(code, { cloudId, channelId, memberUid });
    }

    loginInvite(code: string, delegatorId: string | null): { id: string; Token: { identityToken?: string } } {
        const invite = this.invites.get(code);
        if (!invite) throw new Error('400 INVALID - no such invite');
        if (!delegatorId) throw new Error('No delegatorId for invite flow');
        const key = this.key(invite.cloudId, delegatorId);
        if (!this.bindings.has(key)) this.bindings.set(key, invite.memberUid);
        if (this.answersWithoutToken) return { id: invite.memberUid, Token: {} };
        return { id: invite.memberUid, Token: { identityToken: `idt:${invite.memberUid}` } };
    }

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

class FakeDevice {
    guest = 'guest-1';
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

    startGuest(guest: string): void {
        this.guest = guest;
        this.relayUser = guest;
        this.selectedCloudId = null;
        this.committedUid = undefined;
    }

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
const mockInviteAnswers = new Map<string, ReturnType<FakeCloudServer['loginInvite']>>();
const mockEnterStack = jest.fn();

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({ cloud: mockDevice.cloudRepository }),
            getAcceptorId: () => mockDevice.guest,
        },
        session: {
            useSessionIdentity: () => ({ delegatorId: mockDevice.guest }),
            useInviteFlow: () => ({
                runInviteFlow: async ({ code }: { code: string }) => {
                    const handle = `invite-login-${mockInviteAnswers.size + 1}`;
                    mockInviteAnswers.set(handle, mockServer.loginInvite(code, mockDevice.guest));
                    return { handle, cloudId: null };
                },
                isInviting: false,
            }),
            forgetInviteLogin: (handle: string) => mockInviteAnswers.delete(handle),
            useSwitchCloudSession: () => ({
                switchCloud: async (cloudId: string, options?: { inviteLogin?: { handle: string } }) => {
                    const handle = options?.inviteLogin?.handle;
                    const answer = handle ? mockInviteAnswers.get(handle) : undefined;
                    const invitee = answer?.Token?.identityToken ? answer.id : undefined;
                    mockDevice.committedUid = invitee ?? mockServer.delegate(cloudId, mockDevice.relayUser);
                    mockDevice.selectedCloudId = cloudId;
                },
                isPending: false,
            }),
            useSessionSelection: () => ({ selectedCloudId: mockDevice.selectedCloudId }),
        },
    })
);
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
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
        mockInviteAnswers.clear();
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
        mockServer.issueInvite('invt:1:a', CLOUD, 'room-1');
        await acceptInvite(inviteContext('invt:1:a', 'room-1'));

        mockDevice.startGuest('guest-2');
        mockServer.issueInvite('invt:2:b', CLOUD, 'room-1');
        const background = renderHook(() => useBackgroundDelegation());

        expect(background.result.current).not.toContain(CLOUD);
        expect(mockServer.hasUserFor(CLOUD, 'guest-2')).toBe(false);

        const result = await acceptInvite(inviteContext('invt:2:b', 'room-1'));
        expect(result.current.errorKey).toBeNull();
        expect(mockServer.canRead('room-1', mockDevice.committedUid)).toBe(true);

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
