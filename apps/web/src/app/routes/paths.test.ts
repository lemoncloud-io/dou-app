import { ROUTES, ROUTE_PARAMS } from './paths';

describe('ROUTES constants', () => {
    it('exposes the root and main entry paths', () => {
        expect(ROUTES.root).toBe('/');
        expect(ROUTES.home).toBe('/');
        expect(ROUTES.explore).toBe('/explore');
        expect(ROUTES.notifications).toBe('/notifications');
        expect(ROUTES.createRoom).toBe('/create-room');
        expect(ROUTES.join).toBe('/join');
    });

    it('exposes auth paths', () => {
        expect(ROUTES.auth.login).toBe('/auth/login');
        expect(ROUTES.auth.logout).toBe('/auth/logout');
        expect(ROUTES.auth.oauthResponse).toBe('/auth/oauth-response');
    });

    it('exposes account signup/reset-password flows', () => {
        expect(ROUTES.account.signup.root).toBe('/account/signup');
        expect(ROUTES.account.signup.verify).toBe('/account/signup/verify');
        expect(ROUTES.account.signup.password).toBe('/account/signup/password');
        expect(ROUTES.account.resetPassword.root).toBe('/account/reset-password');
        expect(ROUTES.account.resetPassword.verify).toBe('/account/reset-password/verify');
        expect(ROUTES.account.resetPassword.newPassword).toBe('/account/reset-password/new-password');
    });

    it('exposes chats paths and constant root', () => {
        expect(ROUTES.chats.root).toBe('/chats');
    });

    it('exposes places.order constant', () => {
        expect(ROUTES.places.order).toBe('/places/order');
    });

    it('exposes the mypage hub groups', () => {
        expect(ROUTES.mypage.root).toBe('/mypage');
        expect(ROUTES.mypage.login).toBe('/mypage/login');
        expect(ROUTES.mypage.account.info).toBe('/mypage/account');
        expect(ROUTES.mypage.account.manage).toBe('/mypage/account-manage');
        expect(ROUTES.mypage.account.edit).toBe('/mypage/edit');
        expect(ROUTES.mypage.account.cloudProfile).toBe('/mypage/cloud-profile');
        expect(ROUTES.mypage.account.withdrawal).toBe('/mypage/withdrawal');
        expect(ROUTES.mypage.subscription.root).toBe('/mypage/subscription');
        expect(ROUTES.mypage.subscription.plans).toBe('/mypage/subscription/plans');
        expect(ROUTES.mypage.policy.root).toBe('/mypage/policy');
        expect(ROUTES.mypage.policy.terms).toBe('/mypage/policy/terms');
        expect(ROUTES.mypage.policy.licenses).toBe('/mypage/policy/licenses');
        expect(ROUTES.mypage.policy.privacy).toBe('/mypage/policy/privacy');
    });

    it('exposes the debug sub-tree', () => {
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

describe('ROUTES parameterized builders', () => {
    it('builds auth token path', () => {
        expect(ROUTES.auth.token('abc.def')).toBe('/auth/token/abc.def');
    });

    it('builds chats paths from channelId', () => {
        expect(ROUTES.chats.room('ch1')).toBe('/chats/ch1/room');
        expect(ROUTES.chats.settings('ch1')).toBe('/chats/ch1/settings');
        expect(ROUTES.chats.roomNotifications('ch1')).toBe('/chats/ch1/settings/notifications');
    });

    it('builds place detail from placeId', () => {
        expect(ROUTES.places.detail('p42')).toBe('/places/p42');
    });

    it('interpolates exactly the given argument', () => {
        // Guards against accidental double-encoding or fixed segments.
        expect(ROUTES.chats.room('a/b')).toBe('/chats/a/b/room');
    });
});

describe('ROUTE_PARAMS', () => {
    it('maps param keys to their literal names', () => {
        expect(ROUTE_PARAMS.channelId).toBe('channelId');
        expect(ROUTE_PARAMS.placeId).toBe('placeId');
        expect(ROUTE_PARAMS.token).toBe('token');
    });
});
