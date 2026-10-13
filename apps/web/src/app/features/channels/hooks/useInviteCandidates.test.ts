import { renderHook, waitFor } from '@testing-library/react';

import type { DomainChannel, DomainPlaceMember } from '@chatic/data';

let mockChannels: Array<Partial<DomainChannel>> = [];
let mockIsLoading = false;
let mockUserId: string | undefined = 'me';
// Unverified unless a test says otherwise: the cache-only path, which is the roster union the
// tests below the place-list block were written against.
let mockVerified = false;
let mockSwitching = 0;
let mockTargetRoster: Array<{ id: string }> = [];

type PlaceMembersAnswer = { members: DomainPlaceMember[]; context: { cid: string; sid: string }; profiles: string };
const listPlaceMembers = jest.fn(
    (_query: { placeId: string; sessionPlaceId: string | null }): Promise<PlaceMembersAnswer> =>
        Promise.reject(new Error('403 FORBIDDEN'))
);
const cacheReadList = jest.fn((_query: { channelId: string }) => Promise.resolve({ list: mockTargetRoster }));
const repositories = { user: { listPlaceMembers, cacheReadList } };

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: mockUserId }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: 'site-1' }),
            // My id in this cloud differs from the session's, as it can for a cloud account.
            useUidInCloud: () => 'me-in-cloud',
            SWITCH_SITE_MUTATION_KEY: ['switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
        },
        connection: {
            useCloudVerified: () => mockVerified,
        },
        data: {
            useRuntimeRepositories: () => repositories,
        },
    },
}));
jest.mock('@tanstack/react-query', () => ({
    useIsMutating: ({ mutationKey }: { mutationKey: string[] }) =>
        mutationKey[0] === 'switch-site' ? mockSwitching : 0,
}));
jest.mock('../../../hooks', () => ({
    useHomeChannels: () => ({ channels: mockChannels, isLoading: mockIsLoading }),
    useSelectedCloudId: () => 'cloud-a',
}));

import { useInviteCandidates } from './useInviteCandidates';

const run = (channelId: string | null = 'target', sid: string | null = 'site-1') =>
    renderHook(() => useInviteCandidates(channelId, sid)).result.current;

const member = (id: string, extra: Partial<DomainPlaceMember> = {}): DomainPlaceMember => ({
    id,
    cid: 'cloud-a',
    ...extra,
});
const placeList = (members: DomainPlaceMember[], context = { cid: 'cloud-a', sid: 'site-1' }) =>
    listPlaceMembers.mockResolvedValue({ members, context, profiles: 'loaded' });

beforeEach(() => {
    mockChannels = [];
    mockIsLoading = false;
    mockUserId = 'me';
    mockVerified = false;
    mockSwitching = 0;
    mockTargetRoster = [];
    listPlaceMembers.mockReset();
    listPlaceMembers.mockRejectedValue(new Error('403 FORBIDDEN'));
    cacheReadList.mockClear();
});

describe('useInviteCandidates — from the place member list', () => {
    beforeEach(() => {
        mockVerified = true;
    });

    const settle = async (channelId: string | null = 'target', sid: string | null = 'site-1') => {
        const hook = renderHook(() => useInviteCandidates(channelId, sid));
        await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
        return hook.result.current;
    };

    it('offers a member with no channel and one who shares none with me', async () => {
        mockChannels = [
            { id: 'target', memberIds: ['me'] },
            { id: 'a', memberIds: ['me', 'u-co'] },
        ];
        placeList([
            member('owner', { isOwner: true }),
            member('u-co'),
            // Invited into the place only — no channel anywhere, possibly not accepted yet.
            member('u-nochannel', { name: 'Placeonly' }),
            // In channels of this place, none of them mine.
            member('u-stranger'),
        ]);

        const result = await settle();

        expect(result.candidateIds).toEqual(['owner', 'u-co', 'u-nochannel', 'u-stranger']);
        expect(result.memberById.get('u-nochannel')).toMatchObject({ name: 'Placeonly' });
        expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'site-1', sessionPlaceId: 'site-1' });
    });

    it("leaves out the target's members from both the row and its cached roster, and me under either id", async () => {
        mockChannels = [{ id: 'target', memberIds: ['u-row'] }];
        mockTargetRoster = [{ id: 'u-roster' }];
        placeList([member('me'), member('me-in-cloud'), member('u-row'), member('u-roster'), member('u-free')]);

        const result = await settle();

        expect(result.candidateIds).toEqual(['u-free']);
        expect(cacheReadList).toHaveBeenCalledWith({ channelId: 'target' });
    });

    it('does not mix in the roster union when the list worked', async () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u-gone'] },
        ];
        placeList([member('u-1')]);

        const result = await settle();

        expect(result.candidateIds).toEqual(['u-1']);
    });

    it('falls back to the roster union when the list fails with 403', async () => {
        mockChannels = [
            { id: 'target', memberIds: ['me'] },
            { id: 'a', memberIds: ['me', 'u1'] },
        ];
        listPlaceMembers.mockRejectedValue(new Error('403 FORBIDDEN - not a member of site[site-1]'));

        const result = await settle();

        expect(result.candidateIds).toEqual(['u1']);
        expect(result.memberById.size).toBe(0);
    });

    it('treats an answer asked for in another cloud as no answer and falls back', async () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u-roster'] },
        ];
        placeList([member('u-elsewhere')], { cid: 'cloud-b', sid: 'site-1' });

        const result = await settle();

        expect(result.candidateIds).toEqual(['u-roster']);
        expect(result.fromPlaceList).toBe(false);
    });

    it('holds the list until the channel rows are in, so the target members can be left out', async () => {
        mockIsLoading = true;
        mockChannels = [];
        placeList([member('u-in'), member('u-free')]);

        const hook = renderHook(() => useInviteCandidates('target', 'site-1'));
        await waitFor(() => expect(listPlaceMembers).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(hook.result.current.isLoading).toBe(true);
        expect(hook.result.current.candidateIds).toEqual([]);

        mockIsLoading = false;
        mockChannels = [{ id: 'target', memberIds: ['u-in'] }];
        hook.rerender();

        await waitFor(() => expect(hook.result.current.candidateIds).toEqual(['u-free']));
        expect(hook.result.current.fromPlaceList).toBe(true);
    });

    it('vouches for no place while a switch is in flight, so profiles are not loaded', async () => {
        mockSwitching = 1;
        placeList([member('u-1')]);

        await settle();

        expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'site-1', sessionPlaceId: null });
    });

    it("names the session place, not the target, so a mismatch is the repository's to refuse", async () => {
        placeList([member('u-1')]);

        await settle('target', 'site-2');

        expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'site-2', sessionPlaceId: 'site-1' });
    });

    it('shows nothing, and says it is loading, until the list settles', () => {
        mockChannels = [{ id: 'a', memberIds: ['u-roster'] }];
        listPlaceMembers.mockReturnValue(new Promise(() => undefined));

        const { result } = renderHook(() => useInviteCandidates('target', 'site-1'));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.candidateIds).toEqual([]);
    });

    it('serves the roster union without asking for the list while the socket is unverified', () => {
        mockVerified = false;
        mockChannels = [{ id: 'a', memberIds: ['u-roster'] }];
        placeList([member('u-nochannel')]);

        const { result } = renderHook(() => useInviteCandidates('target', 'site-1'));

        expect(listPlaceMembers).not.toHaveBeenCalled();
        expect(result.current.candidateIds).toEqual(['u-roster']);
    });
});

describe('useInviteCandidates', () => {
    it('내 다른 채널들의 멤버를 합집합으로 모은다', () => {
        mockChannels = [
            { id: 'target', memberIds: ['me'] },
            { id: 'a', memberIds: ['me', 'u1', 'u2'] },
            { id: 'b', memberIds: ['me', 'u2', 'u3'] },
        ];

        expect(run().candidateIds.sort()).toEqual(['u1', 'u2', 'u3']);
    });

    it('이미 타깃 채널에 있는 사람은 뺀다', () => {
        mockChannels = [
            { id: 'target', memberIds: ['me', 'u1'] },
            { id: 'a', memberIds: ['u1', 'u2'] },
        ];

        expect(run().candidateIds).toEqual(['u2']);
    });

    it('나는 후보가 아니다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['me', 'u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    // Two defenses overlap here: excluding the target channel from iteration, and set-subtracting its memberIds.
    it('타깃 채널 행 자체는 후보 출처로 쓰지 않는다', () => {
        mockChannels = [{ id: 'target', memberIds: ['u1', 'u2'] }];

        expect(run().candidateIds).toEqual([]);
    });

    // memberIds is optional — a row that didn't come through the detail:true path may be mixed in.
    it('memberIds가 없는 채널 행은 건너뛴다', () => {
        mockChannels = [{ id: 'target', memberIds: ['me'] }, { id: 'a' }, { id: 'b', memberIds: ['u1'] }];

        expect(run().candidateIds).toEqual(['u1']);
    });

    // Even if the target row arrives without memberIds, excluding it from iteration keeps that room's people from leaking into the candidates.
    it('타깃 행에 memberIds가 없어도 다른 채널에서만 후보를 만든다', () => {
        mockChannels = [{ id: 'target' }, { id: 'a', memberIds: ['u1'] }];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('빈 문자열 id는 후보에 넣지 않는다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['', 'u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('중복은 한 번만 센다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u1', 'u1'] },
            { id: 'b', memberIds: ['u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('channelId나 sid가 없으면 빈 목록이다', () => {
        mockChannels = [{ id: 'a', memberIds: ['u1'] }];

        expect(run(null).candidateIds).toEqual([]);
        expect(run('target', null).candidateIds).toEqual([]);
    });

    // The list must still render even at the moment the session hasn't yet supplied a userId.
    it('userId가 아직 없어도 후보를 만든다', () => {
        mockUserId = undefined;
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('isLoading은 채널 관측의 것을 그대로 전달한다', () => {
        mockIsLoading = true;

        expect(run().isLoading).toBe(true);
    });
});
