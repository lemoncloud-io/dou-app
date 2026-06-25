import { toError, withTimeout } from './errors';

describe('toError', () => {
    it('returns the same Error instance when given an Error', () => {
        const err = new Error('boom');
        expect(toError(err)).toBe(err);
    });

    it('wraps a non-Error value into an Error with stringified message', () => {
        const result = toError('nope');
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe('nope');
    });

    it('wraps null/undefined safely', () => {
        expect(toError(undefined).message).toBe('undefined');
        expect(toError(null).message).toBe('null');
    });
});

describe('withTimeout', () => {
    it('resolves when the promise settles before the timeout', async () => {
        await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
    });

    it('rejects with the original error when the promise rejects', async () => {
        await expect(withTimeout(Promise.reject(new Error('inner')), 50)).rejects.toThrow('inner');
    });

    it('rejects with a TIMEOUT error when the promise is too slow', async () => {
        const slow = new Promise(resolve => setTimeout(resolve, 50));
        await expect(withTimeout(slow, 5, 'Slow op')).rejects.toThrow(/TIMEOUT: Slow op timed out \(5ms\)/);
    });
});
