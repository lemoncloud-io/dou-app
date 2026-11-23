import { renderHook } from '@testing-library/react';

const useRelayInvitesMock = jest.fn();
let mockInvites: Array<Record<string, unknown>> = [];
let mockSentLog: Record<string, { phone: string; name: string }> = {};

jest.mock('../../../hooks', () => ({
    useRelayInvites: (...args: unknown[]) => {
        useRelayInvitesMock(...args);
        return { invites: mockInvites, isLoading: false, refetch: jest.fn() };
    },
    useSentInviteLog: () => ({
        findByInviteId: (id: string) =>
            mockSentLog[id] ? { inviteId: id, name: mockSentLog[id].name, phone: mockSentLog[id].phone } : undefined,
    }),
}));

let mockIsExpired = false;
jest.mock('../../invite/hooks/useInviteCountdown', () => ({
    useInviteCountdown: (expiredAt?: number) =>
        expiredAt ? { days: 0, hours: 1, minutes: 0, seconds: 0, isExpired: mockIsExpired, isImminent: false } : null,
}));

import { useDmInviteState } from './useDmInviteState';

const CHANNEL = 'ch-1';
const PEER = 'peer-1';

const peerJoin = (over: Record<string, unknown> = {}) => ({ userId: PEER, joined: 0, joinedNo: 42, ...over }) as never;

const render = (over: Partial<Parameters<typeof useDmInviteState>[0]> = {}) =>
    renderHook(() =>
        useDmInviteState({ channelId: CHANNEL, hasInviteFlow: true, peerId: PEER, joins: [peerJoin()], ...over })
    );

describe('useDmInviteState', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockSentLog = {};
        mockIsExpired = false;
    });

    it('상대가 참여 중이면 present이고 초대를 조회하지 않는다', () => {
        const { result } = render({ joins: [peerJoin({ joined: 1 })] });

        expect(result.current.state).toEqual({ kind: 'present' });
        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { enabled: false, pollIntervalMs: undefined });
    });

    it('dm이 아니면 present이고 초대를 조회하지 않는다', () => {
        const { result } = render({ hasInviteFlow: false });

        expect(result.current.state).toEqual({ kind: 'present' });
        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { enabled: false, pollIntervalMs: undefined });
    });

    it('상대가 나가면 초대 조회를 켜고 30초 폴링을 붙인다', () => {
        render();

        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { enabled: true, pollIntervalMs: 30_000 });
    });

    it('상대가 나갔고 초대가 없으면 absent다', () => {
        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'absent' });
    });

    it('이 채널을 향하는 초대만 고른다', () => {
        mockInvites = [
            { id: 'other', channelId: 'ch-other', state: 'pending', expiredAt: 111 },
            { id: 'mine', channelId: CHANNEL, state: 'pending', expiredAt: 222 },
        ];

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'pending', expiredAt: 222 });
    });

    it('최신순 목록의 첫 매치를 쓴다', () => {
        mockInvites = [
            { id: 'fresh', channelId: CHANNEL, state: 'pending', expiredAt: 333 },
            { id: 'founding', channelId: CHANNEL, state: 'accepted' },
        ];

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'pending', expiredAt: 333 });
    });

    it('로컬에서 걷어낸 초대는 없는 것으로 본다', () => {
        mockInvites = [{ id: 'dismissed', channelId: CHANNEL, state: 'rejected', dismissedAt: 1 }];

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'absent' });
    });

    it('카운트다운이 끝났으면 서버가 pending이라도 expired로 내린다', () => {
        mockInvites = [{ id: 'mine', channelId: CHANNEL, state: 'pending', expiredAt: 222 }];
        mockIsExpired = true;

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'expired', expiredAt: 222 });
    });

    it('상대를 모르면 present로 둔다 — roster가 아직 안 왔을 수 있다', () => {
        const { result } = render({ peerId: null });

        expect(result.current.state).toEqual({ kind: 'present' });
    });
});

describe('useDmInviteState — 재초대 프리필', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockSentLog = {};
        mockIsExpired = false;
    });

    it('발급 이력에 있으면 이름과 번호를 돌려준다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'rejected' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({ name: '레몬', phone: '+821012345678' });
    });

    it('진행 중인 초대가 없어도 이 방을 만든 초대에서 번호를 찾는다', () => {
        mockInvites = [{ id: 'founding', channelId: CHANNEL, state: 'accepted' }];
        mockSentLog = { founding: { phone: '+821011112222', name: '토끼' } };

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'absent' });
        expect(result.current.resolveReinvitePrefill()).toEqual({ name: '토끼', phone: '+821011112222' });
    });

    it('다른 방의 초대는 프리필로 쓰지 않는다', () => {
        mockInvites = [{ id: 'other', channelId: 'ch-other', state: 'accepted' }];
        mockSentLog = { other: { phone: '+821099998888', name: '남' } };

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });

    it('이 기기에 이력이 없으면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });

    it('채널을 모르면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render({ channelId: null });

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });
});

describe('useDmInviteState — 로스터에서 상대가 사라진 경우', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInvites = [];
        mockSentLog = {};
        mockIsExpired = false;
    });

    const roster = (memberIds?: string[]) => ({ stereo: 'dm' as const, memberIds });

    it('join 행도 peerId도 없지만 로스터에 나만 남았으면 부재로 본다', () => {
        const { result } = render({ peerId: undefined, joins: [], channel: roster(['me']), userId: 'me' });
        expect(result.current.state.kind).not.toBe('present');
    });

    it('로스터에 상대가 있으면 present다', () => {
        const { result } = render({ peerId: undefined, joins: [], channel: roster(['me', PEER]), userId: 'me' });
        expect(result.current.state.kind).toBe('present');
    });

    it('로스터가 비어 있으면(미로딩) present를 유지한다', () => {
        const { result } = render({ peerId: undefined, joins: [], channel: roster([]), userId: 'me' });
        expect(result.current.state.kind).toBe('present');
    });

    it('DM이 아니면 로스터를 보지 않는다', () => {
        const { result } = render({
            hasInviteFlow: false,
            peerId: undefined,
            joins: [],
            channel: { stereo: 'private', memberIds: ['me'] },
            userId: 'me',
        });
        expect(result.current.state.kind).toBe('present');
    });
});

describe('useDmInviteState — a room with no invite flow', () => {
    it('stays present even when the peer left, and asks for no invites', () => {
        const { result } = render({ hasInviteFlow: false, joins: [peerJoin()] });

        expect(result.current.state).toEqual({ kind: 'present' });
        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { enabled: false, pollIntervalMs: undefined });
    });

    it('ignores a roster that holds nobody but me', () => {
        const { result } = render({
            hasInviteFlow: false,
            peerId: undefined,
            joins: [],
            channel: { stereo: 'dm' as const, memberIds: ['me'] },
            userId: 'me',
        });

        expect(result.current.state.kind).toBe('present');
    });
});
