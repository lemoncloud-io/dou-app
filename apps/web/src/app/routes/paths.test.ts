import { ROUTES, ROUTE_PARAMS } from './paths';

describe('ROUTES — 상수 경로', () => {
    it('root와 메인 진입 경로를 노출한다', () => {
        expect(ROUTES.root).toBe('/');
        expect(ROUTES.home).toBe('/');
        expect(ROUTES.notifications).toBe('/notifications');
        expect(ROUTES.join).toBe('/join');
    });

    it('auth 경로를 노출한다', () => {
        expect(ROUTES.auth.login).toBe('/auth/login');
        expect(ROUTES.auth.logout).toBe('/auth/logout');
        expect(ROUTES.auth.oauthResponse).toBe('/auth/oauth-response');
    });

    it('account 회원가입/비밀번호 재설정 플로우를 노출한다', () => {
        expect(ROUTES.account.signup.root).toBe('/account/signup');
        expect(ROUTES.account.signup.verify).toBe('/account/signup/verify');
        expect(ROUTES.account.signup.password).toBe('/account/signup/password');
        expect(ROUTES.account.resetPassword.root).toBe('/account/reset-password');
        expect(ROUTES.account.resetPassword.verify).toBe('/account/reset-password/verify');
        expect(ROUTES.account.resetPassword.newPassword).toBe('/account/reset-password/new-password');
    });

    it('channels 경로와 상수 root를 노출한다', () => {
        expect(ROUTES.channels.root).toBe('/channels');
        expect(ROUTES.channels.create).toBe('/channels/create');
    });

    it('place.order 상수를 노출한다', () => {
        expect(ROUTES.place.order).toBe('/place/order');
    });

    it('subscription 허브를 노출한다', () => {
        expect(ROUTES.subscription.root).toBe('/subscription');
        expect(ROUTES.subscription.plans).toBe('/subscription/plans');
    });

    it('mypage 허브 그룹을 노출한다', () => {
        expect(ROUTES.mypage.root).toBe('/mypage');
        expect(ROUTES.mypage.login).toBe('/mypage/login');
        expect(ROUTES.mypage.account.info).toBe('/mypage/account');
        expect(ROUTES.mypage.account.manage).toBe('/mypage/account-manage');
        expect(ROUTES.mypage.account.edit).toBe('/mypage/edit');
        expect(ROUTES.mypage.account.cloudProfile).toBe('/mypage/cloud-profile');
        expect(ROUTES.mypage.account.withdrawal).toBe('/mypage/withdrawal');
        expect(ROUTES.mypage.policy.root).toBe('/mypage/policy');
        expect(ROUTES.mypage.policy.terms).toBe('/mypage/policy/terms');
        expect(ROUTES.mypage.policy.licenses).toBe('/mypage/policy/licenses');
        expect(ROUTES.mypage.policy.privacy).toBe('/mypage/policy/privacy');
    });

    it('debug 하위 트리를 노출한다', () => {
        expect(ROUTES.mypage.debug.root).toBe('/mypage/debug');
        expect(ROUTES.mypage.debug.login).toBe('/mypage/debug/login');
        expect(ROUTES.mypage.debug.dashboard).toBe('/mypage/debug/dashboard');
        expect(ROUTES.mypage.debug.state).toBe('/mypage/debug/state');
        expect(ROUTES.mypage.debug.logBuffer).toBe('/mypage/debug/log-buffer');
        expect(ROUTES.mypage.debug.cacheTest).toBe('/mypage/debug/cache-test');
        expect(ROUTES.mypage.debug.uploadTest).toBe('/mypage/debug/upload-test');
        expect(ROUTES.mypage.debug.badgeCount).toBe('/mypage/debug/badge-count');
    });
});

describe('ROUTES — 파라미터 빌더', () => {
    it('auth 토큰 경로를 생성한다', () => {
        expect(ROUTES.auth.token('abc.def')).toBe('/auth/token/abc.def');
    });

    it('channelId로 channels 경로를 생성한다', () => {
        expect(ROUTES.channels.room('ch1')).toBe('/channels/ch1/room');
        expect(ROUTES.channels.settings('ch1')).toBe('/channels/ch1/settings');
        expect(ROUTES.channels.roomNotifications('ch1')).toBe('/channels/ch1/settings/notifications');
    });

    it('placeId로 place 상세 경로를 생성한다', () => {
        expect(ROUTES.place.detail('p42')).toBe('/place/p42');
    });

    it('주어진 인수를 그대로 보간한다', () => {
        // Guards against accidental double-encoding or fixed segments.
        expect(ROUTES.channels.room('a/b')).toBe('/channels/a/b/room');
    });
});

describe('ROUTE_PARAMS — 파라미터 키', () => {
    it('파라미터 키를 리터럴 이름에 매핑한다', () => {
        expect(ROUTE_PARAMS.channelId).toBe('channelId');
        expect(ROUTE_PARAMS.placeId).toBe('placeId');
        expect(ROUTE_PARAMS.token).toBe('token');
    });
});
