import { ROUTES, ROUTE_PARAMS } from './paths';

describe('ROUTES — 상수 경로', () => {
    it('root와 메인 진입 경로를 노출한다', () => {
        expect(ROUTES.root).toBe('/');
        expect(ROUTES.home).toBe('/');
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
    });

    it('invite 연락처 초대 경로를 노출한다(ADR-0033 Track B)', () => {
        expect(ROUTES.invite.contact).toBe('/invite/contact');
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
});

describe('ROUTES — 파라미터 빌더', () => {
    it('channelId로 channels 경로를 생성한다', () => {
        expect(ROUTES.channels.room('ch1')).toBe('/channels/ch1/room');
        expect(ROUTES.channels.settings('ch1')).toBe('/channels/ch1/settings');
    });

    it('placeId로 place 상세 경로를 생성한다', () => {
        expect(ROUTES.place.detail('p42')).toBe('/place/p42');
    });

    it('place 설정 하위 경로를 생성한다', () => {
        expect(ROUTES.place.settings('p42')).toBe('/place/p42/settings');
        expect(ROUTES.place.settingsInfo('p42')).toBe('/place/p42/settings/info');
        expect(ROUTES.place.settingsProfile('p42')).toBe('/place/p42/settings/profile');
        expect(ROUTES.place.settingsChannels('p42')).toBe('/place/p42/settings/channels');
    });

    it('주어진 인수를 그대로 보간한다', () => {
        // Guards against accidental double-encoding or fixed segments.
        expect(ROUTES.channels.room('a/b')).toBe('/channels/a/b/room');
    });

    it('inviteId로 초대 대기 화면 경로를 생성한다(코드가 아니라 id — 자격증명을 URL에 남기지 않는다)', () => {
        expect(ROUTES.invite.waiting('invite-1')).toBe('/invite/invite-1/waiting');
    });
});

describe('ROUTE_PARAMS — 파라미터 키', () => {
    it('파라미터 키를 리터럴 이름에 매핑한다', () => {
        expect(ROUTE_PARAMS.channelId).toBe('channelId');
        expect(ROUTE_PARAMS.placeId).toBe('placeId');
        expect(ROUTE_PARAMS.token).toBe('token');
    });
});
