import { EmailVerifyRefusal, isEmailVerifyRefusal } from './emailVerify';

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
