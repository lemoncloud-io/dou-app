import { verifyDebugCode } from './verifyDebugCode';

describe('verifyDebugCode', () => {
    it('입력이 기대 코드와 일치하면 true를 반환한다', () => {
        expect(verifyDebugCode('123456', '123456')).toBe(true);
    });

    it('입력이 기대 코드와 다르면 false를 반환한다', () => {
        expect(verifyDebugCode('111111', '123456')).toBe(false);
    });

    it('기대 코드가 undefined면 항상 false를 반환한다(fail-closed)', () => {
        expect(verifyDebugCode('123456', undefined)).toBe(false);
    });

    it('기대 코드가 빈 문자열이면 입력이 빈 문자열이어도 false를 반환한다', () => {
        expect(verifyDebugCode('', '')).toBe(false);
    });

    it('입력이 빈 문자열이면 false를 반환한다', () => {
        expect(verifyDebugCode('', '123456')).toBe(false);
    });
});
