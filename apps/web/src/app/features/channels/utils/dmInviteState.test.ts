import { canReinviteDm, resolveDmInviteState, type DmInviteState } from './dmInviteState';

const EXPIRY = 1_700_000_000_000;

describe('resolveDmInviteState — 1:1 상대 부재 상태 파생', () => {
    it('상대가 있으면 초대가 무엇이든 present다', () => {
        expect(resolveDmInviteState({ peerLeft: false })).toEqual({ kind: 'present' });
        expect(resolveDmInviteState({ peerLeft: false, invite: { state: 'pending', expiredAt: EXPIRY } })).toEqual({
            kind: 'present',
        });
    });

    it('상대가 없고 초대도 없으면 absent다', () => {
        expect(resolveDmInviteState({ peerLeft: true })).toEqual({ kind: 'absent' });
        expect(resolveDmInviteState({ peerLeft: true, invite: null })).toEqual({ kind: 'absent' });
    });

    it('살아 있는 초대는 만료 시각을 들고 pending이 된다', () => {
        expect(resolveDmInviteState({ peerLeft: true, invite: { state: 'pending', expiredAt: EXPIRY } })).toEqual({
            kind: 'pending',
            expiredAt: EXPIRY,
        });
    });

    // 서버 state는 다음 조회까지 pending으로 남는다 — 링크가 죽는 순간은 카운트다운이 판정한다.
    it('서버가 아직 pending이라도 카운트다운이 끝났으면 expired로 내린다', () => {
        expect(
            resolveDmInviteState({ peerLeft: true, invite: { state: 'pending', expiredAt: EXPIRY }, isExpired: true })
        ).toEqual({ kind: 'expired', expiredAt: EXPIRY });
    });

    it('거절된 초대는 rejected다', () => {
        expect(resolveDmInviteState({ peerLeft: true, invite: { state: 'rejected' } })).toEqual({ kind: 'rejected' });
    });

    it('서버가 만료로 답한 초대는 expired다', () => {
        expect(resolveDmInviteState({ peerLeft: true, invite: { state: 'expired', expiredAt: EXPIRY } })).toEqual({
            kind: 'expired',
            expiredAt: EXPIRY,
        });
    });

    // 이 방이 존재한다는 것 자체가 누군가 초대를 수락했다는 뜻이라, accepted 행은 이 채널을 계속
    // 가리키며 목록에 남는다. 그것을 "진행 중인 초대"로 읽으면 상대가 나간 뒤 CTA가 영구히 사라진다.
    it('이미 소진된 초대(accepted·canceled)는 초대가 없는 것과 같다', () => {
        expect(resolveDmInviteState({ peerLeft: true, invite: { state: 'accepted' } })).toEqual({ kind: 'absent' });
        expect(resolveDmInviteState({ peerLeft: true, invite: { state: 'canceled' } })).toEqual({ kind: 'absent' });
    });

    it('상태를 모르는 초대도 초대가 없는 것과 같다', () => {
        expect(resolveDmInviteState({ peerLeft: true, invite: {} })).toEqual({ kind: 'absent' });
    });
});

describe('canReinviteDm — 다시 초대하기 노출', () => {
    const state = (kind: DmInviteState['kind']): DmInviteState => ({ kind }) as DmInviteState;

    it('상대가 있으면 재초대할 것이 없다', () => {
        expect(canReinviteDm(state('present'))).toBe(false);
    });

    // 살아 있는 코드가 하나 있는 동안 두 번째를 만들지 않는다 (Figma 4062-14154에 버튼이 없다).
    it('초대가 살아 있는 동안에는 감춘다', () => {
        expect(canReinviteDm(state('pending'))).toBe(false);
    });

    it('초대가 없거나 종국이면 노출한다', () => {
        expect(canReinviteDm(state('absent'))).toBe(true);
        expect(canReinviteDm(state('rejected'))).toBe(true);
        expect(canReinviteDm(state('expired'))).toBe(true);
    });
});
