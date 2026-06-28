import { toError, withTimeout } from './errors';

describe('toError — 에러 정규화', () => {
    it('Error를 받으면 동일한 Error 인스턴스를 반환한다', () => {
        const err = new Error('boom');
        expect(toError(err)).toBe(err);
    });

    it('Error가 아닌 값은 문자열 메시지를 가진 Error로 감싼다', () => {
        const result = toError('nope');
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe('nope');
    });

    it('null/undefined를 안전하게 감싼다', () => {
        expect(toError(undefined).message).toBe('undefined');
        expect(toError(null).message).toBe('null');
    });
});

describe('withTimeout — 타임아웃 래퍼', () => {
    it('타임아웃 전에 프로미스가 완료되면 resolve한다', async () => {
        await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
    });

    it('프로미스가 reject되면 원래 에러로 reject한다', async () => {
        await expect(withTimeout(Promise.reject(new Error('inner')), 50)).rejects.toThrow('inner');
    });

    it('프로미스가 너무 느리면 TIMEOUT 에러로 reject한다', async () => {
        const slow = new Promise(resolve => setTimeout(resolve, 50));
        await expect(withTimeout(slow, 5, 'Slow op')).rejects.toThrow(/TIMEOUT: Slow op timed out \(5ms\)/);
    });
});
