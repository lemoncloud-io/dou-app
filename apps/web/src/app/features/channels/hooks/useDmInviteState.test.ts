import { renderHook } from '@testing-library/react';

const useRelayInvitesMock = jest.fn();
let mockInvites: Array<Record<string, unknown>> = [];
/** This device's issue log, keyed by invite id — the only source of a full phone number. */
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

// The countdown has its own tests (useInviteCountdown.test.ts). Here only the wiring is checked
// — that `isExpired` is passed through to the derived function.
let mockIsExpired = false;
jest.mock('../../invite/hooks/useInviteCountdown', () => ({
    useInviteCountdown: (expiredAt?: number) =>
        expiredAt ? { days: 0, hours: 1, minutes: 0, seconds: 0, isExpired: mockIsExpired, isImminent: false } : null,
}));

import { useDmInviteState } from './useDmInviteState';

const CHANNEL = 'ch-1';
const PEER = 'peer-1';

/** A join row for the peer. `joinedNo` is what marks a departure apart from a pending invite. */
const peerJoin = (over: Record<string, unknown> = {}) => ({ userId: PEER, joined: 0, joinedNo: 42, ...over }) as never;

const render = (over: Partial<Parameters<typeof useDmInviteState>[0]> = {}) =>
    renderHook(() => useDmInviteState({ channelId: CHANNEL, isDm: true, peerId: PEER, joins: [peerJoin()], ...over }));

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

    // This hook lives in ChannelRoomPage, which every stereo shares — opening a group room must not trigger an invite.list call.
    it('dm이 아니면 present이고 초대를 조회하지 않는다', () => {
        const { result } = render({ isDm: false });

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

    // invite.list is sorted newest-first, so the first match is the current state — a freshly
    // issued pending invite comes before the accepted row that founded this room.
    it('최신순 목록의 첫 매치를 쓴다', () => {
        mockInvites = [
            { id: 'fresh', channelId: CHANNEL, state: 'pending', expiredAt: 333 },
            { id: 'founding', channelId: CHANNEL, state: 'accepted' },
        ];

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'pending', expiredAt: 333 });
    });

    // A local dismiss (ADR-0052) marks "the user already handled this". If that row kept
    // representing the room, the rejected wording would stay permanently.
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

    // The server doesn't return the raw number (only last4) — this device's issue history is the only source.
    it('발급 이력에 있으면 이름과 번호를 돌려준다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'rejected' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({ name: '레몬', phone: '+821012345678' });
    });

    // A room with no live invite is the common case — even then, the number is recovered from the accepted invite that founded this room.
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

    // The case where I was the invitee, or I switched devices. Don't block it — send back an empty form instead.
    it('이 기기에 이력이 없으면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });

    // The prefill is only read the moment the CTA is pressed (a function, not a value) — so the
    // gate "don't fetch it if the peer is present" belongs to the CTA side. The only guard left
    // here is not knowing the channel.
    it('채널을 모르면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render({ channelId: null });

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });
});
