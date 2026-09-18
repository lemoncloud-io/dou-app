import { resolveInviteAcceptRedirect } from './inviteEntryRedirect';

describe('resolveInviteAcceptRedirect', () => {
    it('릴레이 초대 진입을 수락 페이지로 보낸다', () => {
        expect(resolveInviteAcceptRedirect('?provider=invite&code=abc&relay=1')).toBe(
            '/invite/accept?provider=invite&code=abc&relay=1'
        );
    });

    it('클라우드 초대 진입을 수락 페이지로 보낸다', () => {
        expect(resolveInviteAcceptRedirect('?provider=invite&code=abc&_backend=https%3A%2F%2Fapi')).toBe(
            '/invite/accept?provider=invite&code=abc&_backend=https%3A%2F%2Fapi'
        );
    });

    it('물음표가 없는 쿼리도 받는다', () => {
        expect(resolveInviteAcceptRedirect('provider=invite&code=abc&relay=1')).toBe(
            '/invite/accept?provider=invite&code=abc&relay=1'
        );
    });

    it('모델링하지 않은 파라미터도 그대로 실어 보낸다 (utm 등 캠페인 추적)', () => {
        const target = resolveInviteAcceptRedirect('?provider=invite&code=abc&relay=1&utm_source=sms');
        expect(target).toContain('utm_source=sms');
    });

    it('초대가 아닌 쿼리는 null — 호출자의 라우팅을 건드리지 않는다', () => {
        expect(resolveInviteAcceptRedirect('')).toBeNull();
        expect(resolveInviteAcceptRedirect('?foo=bar')).toBeNull();
    });

    it('초대로 인정되지 않는 반쪽 링크도 null이다', () => {
        // Only the provider marker is present, no code.
        expect(resolveInviteAcceptRedirect('?provider=invite')).toBeNull();
        // A code is present, but there's no destination (_backend / relay), so where to accept it is unknown.
        expect(resolveInviteAcceptRedirect('?provider=invite&code=abc')).toBeNull();
        // A code with no invite marker could belong to someone else's parameters, e.g. an OAuth callback.
        expect(resolveInviteAcceptRedirect('?code=abc&relay=1')).toBeNull();
    });
});
