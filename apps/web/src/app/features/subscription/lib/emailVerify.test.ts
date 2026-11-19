import { EmailVerifyRefusal, isEmailAlreadyRegistered, isEmailVerifyRefusal } from './emailVerify';

describe('isEmailVerifyRefusal', () => {
    it('의도된 거절을 알아본다 — 이 문구만 사용자에게 보여도 된다', () => {
        expect(isEmailVerifyRefusal(new EmailVerifyRefusal('이미 사용 중인 이메일이에요'))).toBe(true);
    });

    it('요청 실패는 매칭하지 않는다 — 그 메시지는 백엔드 문구다', () => {
        // throwIfApiError throws the server's string as-is, and axios throws its own message as-is.
        // Neither should end up on a toast.
        expect(isEmailVerifyRefusal(new Error('403 FORBIDDEN - membership is not valid'))).toBe(false);
        expect(isEmailVerifyRefusal(new Error('Request failed with status code 500'))).toBe(false);
    });

    it('Error가 아닌 값에도 안전하다', () => {
        expect(isEmailVerifyRefusal(undefined)).toBe(false);
        expect(isEmailVerifyRefusal('nope')).toBe(false);
    });
});

describe('isEmailAlreadyRegistered', () => {
    // What `throwIfApiError` rethrows when the relay answers `send` for an address another user holds.
    const RELAY = '409 CONFLICT - alias[taken@user.test] is already registered - verifyEmail(send/taken@user.test)';

    it('matches the relay conflict the HTTP layer rethrows as a plain Error', () => {
        expect(isEmailAlreadyRegistered(new Error(RELAY))).toBe(true);
    });

    it('matches on the leading code, not on the wording after it', () => {
        expect(isEmailAlreadyRegistered(new Error('409 CONFLICT - alias is taken'))).toBe(true);
    });

    it('does not match a 409 that is not the leading conflict code', () => {
        expect(isEmailAlreadyRegistered(new Error('Request failed with status code 409'))).toBe(false);
        expect(isEmailAlreadyRegistered({ status: 409, message: 'Conflict' })).toBe(false);
    });

    it('does not read a 409 inside the echoed address as a conflict', () => {
        expect(
            isEmailAlreadyRegistered(new Error('400 INVALID - @code[1] is mismatched - verifyEmail(check/a.409@x.io)'))
        ).toBe(false);
    });

    it('leaves every other failure alone', () => {
        expect(isEmailAlreadyRegistered(new Error('400 INVALID - @code[000000] is mismatched'))).toBe(false);
        expect(isEmailAlreadyRegistered(new Error('Request failed with status code 500'))).toBe(false);
    });

    it('is safe on values that are not errors', () => {
        expect(isEmailAlreadyRegistered(undefined)).toBe(false);
        expect(isEmailAlreadyRegistered(null)).toBe(false);
        expect(isEmailAlreadyRegistered('409 CONFLICT')).toBe(false);
    });
});
