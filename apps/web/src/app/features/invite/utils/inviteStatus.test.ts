import { resolveInviteRowBadge, resolveReinviteVariant } from './inviteStatus';

describe('resolveInviteRowBadge', () => {
    it('pending은 pending 뱃지를 반환한다', () => {
        expect(resolveInviteRowBadge('pending')).toEqual({
            variant: 'pending',
            labelKey: 'contactInvite.badge.pending',
        });
    });

    it('expired는 expired 뱃지를 반환한다', () => {
        expect(resolveInviteRowBadge('expired')).toEqual({
            variant: 'expired',
            labelKey: 'contactInvite.badge.expired',
        });
    });

    it('accepted는 뱃지를 그리지 않는다(null) — 실채널 행으로 대체된다', () => {
        expect(resolveInviteRowBadge('accepted')).toBeNull();
    });

    it('state가 없으면 null이다', () => {
        expect(resolveInviteRowBadge(undefined)).toBeNull();
    });

    it('서버에 없는 거절 상태가 와도(요청 2번 미지원) expired와 동일하게 취급한다', () => {
        // MyInviteStatus는 오늘 'rejected'를 가질 수 없지만, 미래를 가정한 방어적 캐스팅.
        expect(resolveInviteRowBadge('rejected' as never)).toEqual({
            variant: 'expired',
            labelKey: 'contactInvite.badge.expired',
        });
    });
});

describe('resolveReinviteVariant', () => {
    it('pending이면 pending 변형을 고른다', () => {
        expect(resolveReinviteVariant('pending')).toBe('pending');
    });

    it('expired면 expired 변형을 고른다', () => {
        expect(resolveReinviteVariant('expired')).toBe('expired');
    });

    it('목록에서 찾지 못해 state가 없으면 안전하게 expired(재발급 허용) 취급한다', () => {
        expect(resolveReinviteVariant(undefined)).toBe('expired');
    });

    it('declined는 오늘 어떤 서버 state로도 나오지 않는다(스텁 — 요청 2번)', () => {
        expect(resolveReinviteVariant('accepted')).not.toBe('declined');
        expect(resolveReinviteVariant('pending')).not.toBe('declined');
        expect(resolveReinviteVariant('expired')).not.toBe('declined');
    });
});
