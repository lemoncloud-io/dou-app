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

// 카운트다운은 자기 테스트가 있다(useInviteCountdown.test.ts). 여기서는 배선만 본다 —
// `isExpired`가 파생 함수까지 전달되는지.
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

    // 이 훅은 모든 stereo가 공유하는 ChannelRoomPage에 산다 — 그룹방을 열었다고 invite.list가
    // 나가면 안 된다.
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

    // invite.list는 최신순이므로 첫 매치가 현재 상태다 — 새로 발급한 pending이 이 방을 만든
    // accepted 행보다 앞선다.
    it('최신순 목록의 첫 매치를 쓴다', () => {
        mockInvites = [
            { id: 'fresh', channelId: CHANNEL, state: 'pending', expiredAt: 333 },
            { id: 'founding', channelId: CHANNEL, state: 'accepted' },
        ];

        const { result } = render();

        expect(result.current.state).toEqual({ kind: 'pending', expiredAt: 333 });
    });

    // 로컬 dismiss(ADR-0052)는 "사용자가 이미 처리했다"는 표시다. 그 행이 방을 대변하면
    // 거절 문구가 영구히 남는다.
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

    // 서버는 번호 원문을 주지 않는다(last4만) — 이 기기 발급 이력이 유일한 출처다.
    it('발급 이력에 있으면 이름과 번호를 돌려준다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'rejected' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({ name: '레몬', phone: '+821012345678' });
    });

    // 살아 있는 초대가 없는 방이 보통이다 — 그때도 이 방을 만든 accepted 초대에서 번호를 되찾는다.
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

    // 내가 피초대자였던 방·기기를 바꾼 경우. 막지 않고 빈 폼으로 보낸다.
    it('이 기기에 이력이 없으면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];

        const { result } = render();

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });

    // 프리필은 CTA를 누른 순간에만 읽는다(값이 아니라 함수) — 그래서 "상대가 있으면 안 구한다"는
    // 게이트는 CTA 쪽이 갖는다. 여기 남은 유일한 가드는 채널을 모를 때다.
    it('채널을 모르면 빈 프리필이다', () => {
        mockInvites = [{ id: 'inv-1', channelId: CHANNEL, state: 'expired' }];
        mockSentLog = { 'inv-1': { phone: '+821012345678', name: '레몬' } };

        const { result } = render({ channelId: null });

        expect(result.current.resolveReinvitePrefill()).toEqual({});
    });
});
