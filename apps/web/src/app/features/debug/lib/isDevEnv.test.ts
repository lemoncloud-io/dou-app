import { isDevEnv } from './isDevEnv';

describe('isDevEnv', () => {
    it('DEV 환경이면 true를 반환한다', () => {
        expect(isDevEnv('DEV')).toBe(true);
    });

    it('LOCAL 환경이면 true를 반환한다', () => {
        expect(isDevEnv('LOCAL')).toBe(true);
    });

    it('PROD 환경이면 false를 반환한다', () => {
        expect(isDevEnv('PROD')).toBe(false);
    });

    it('env 값이 없으면(undefined) false를 반환한다', () => {
        expect(isDevEnv(undefined)).toBe(false);
    });
});
