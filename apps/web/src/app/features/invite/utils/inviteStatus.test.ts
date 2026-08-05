import { resolveInviteRowBadge, resolveReinviteVariant } from './inviteStatus';

describe('resolveInviteRowBadge', () => {
    it('pending은 pending 뱃지를 반환한다', () => {
        expect(resolveInviteRowBadge('pending')).toEqual({
            kind: 'pending',
            variant: 'pending',
            labelKey: 'contactInvite.badge.pending',
        });
    });

    it('expired는 expired 뱃지를 반환한다', () => {
        expect(resolveInviteRowBadge('expired')).toEqual({
            kind: 'expired',
            variant: 'expired',
            labelKey: 'contactInvite.badge.expired',
        });
    });

    it('rejected는 거절 라벨을 쓰고 톤은 expired를 공유한다 (ADR-0043)', () => {
        expect(resolveInviteRowBadge('rejected')).toEqual({
            kind: 'declined',
            variant: 'expired',
            labelKey: 'contactInvite.badge.declined',
        });
    });

    it('accepted는 뱃지를 그리지 않는다(null) — 실채널 행으로 대체된다', () => {
        expect(resolveInviteRowBadge('accepted')).toBeNull();
    });

    it('canceled는 뱃지를 그리지 않는다(null) — 발신자가 이미 거둔 초대다', () => {
        expect(resolveInviteRowBadge('canceled')).toBeNull();
    });

    it('state가 없으면 null이다', () => {
        expect(resolveInviteRowBadge(undefined)).toBeNull();
    });
});

describe('resolveReinviteVariant', () => {
    it('pending이면 pending 변형을 고른다', () => {
        expect(resolveReinviteVariant('pending')).toBe('pending');
    });

    it('expired면 expired 변형을 고른다', () => {
        expect(resolveReinviteVariant('expired')).toBe('expired');
    });

    it('rejected면 declined 변형을 고른다 (ADR-0043)', () => {
        expect(resolveReinviteVariant('rejected')).toBe('declined');
    });

    it('목록에서 찾지 못해 state가 없으면 안전하게 expired(재발급 허용) 취급한다', () => {
        expect(resolveReinviteVariant(undefined)).toBe('expired');
    });

    it('canceled도 expired 취급이다 — 어느 쪽이든 옛 링크는 죽었고 재발급이 그 자리다', () => {
        expect(resolveReinviteVariant('canceled')).toBe('expired');
    });
});
