import { type InviteAcceptStep, resolveInviteErrorKey } from './resolveInviteErrorKey';

const err = (message: string) => new Error(message);

describe('resolveInviteErrorKey — 초대 실패 원인 매핑', () => {
    it('타임아웃은 단계와 무관하게 timeout 키', () => {
        expect(resolveInviteErrorKey('login-invite', err('TIMEOUT: no response'))).toBe('inviteAccept.timeout');
        expect(resolveInviteErrorKey('enter-cloud', err('TIMEOUT: no response'))).toBe('inviteAccept.timeout');
    });

    it('네트워크 오류는 단계와 무관하게 networkError 키', () => {
        expect(resolveInviteErrorKey('enter-site', err('Network Error'))).toBe('inviteAccept.networkError');
        expect(resolveInviteErrorKey('login-invite', err('ERR_NETWORK'))).toBe('inviteAccept.networkError');
    });

    it('login-invite 단계의 400/404는 expired 키', () => {
        expect(resolveInviteErrorKey('login-invite', err('400 INVALID - bad code'))).toBe('inviteAccept.expired');
        expect(resolveInviteErrorKey('login-invite', err('404 NOT FOUND - invite'))).toBe('inviteAccept.expired');
    });

    it('login-invite 단계의 401/403은 authVerifyFailed 키', () => {
        expect(resolveInviteErrorKey('login-invite', err('401 UNAUTHORIZED'))).toBe('inviteAccept.authVerifyFailed');
        expect(resolveInviteErrorKey('login-invite', err('403 FORBIDDEN'))).toBe('inviteAccept.authVerifyFailed');
    });

    it('login-invite 단계의 그 외 서버 오류는 failed 키', () => {
        expect(resolveInviteErrorKey('login-invite', err('500 SERVER ERROR'))).toBe('inviteAccept.failed');
    });

    it.each<InviteAcceptStep>(['cache-cloud', 'enter-cloud', 'enter-site', 'enter-channel'])(
        '로그인 성공 후 %s 단계 실패는 enterFailed 키',
        step => {
            expect(resolveInviteErrorKey(step, err('400 INVALID'))).toBe('inviteAccept.enterFailed');
        }
    );
});
