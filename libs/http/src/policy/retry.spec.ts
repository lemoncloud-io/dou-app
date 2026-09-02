import { withRetry, withTimeout } from './retry';

describe('withRetry', () => {
    it('retries a retryable failure with exponential backoff and eventually succeeds', async () => {
        jest.useFakeTimers();
        let attempts = 0;
        const op = jest.fn(async () => {
            attempts += 1;
            if (attempts < 3) throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
            return 'ok';
        });

        const promise = withRetry(op, 4, 'test');
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(2000);
        await expect(promise).resolves.toBe('ok');
        expect(op).toHaveBeenCalledTimes(3);
        jest.useRealTimers();
    });

    it('a non-retryable classification stops immediately and calls onFatal', async () => {
        const onFatal = jest.fn();
        const op = jest.fn(async () => {
            throw Object.assign(new Error('bad request'), { status: 400 });
        });

        await expect(withRetry(op, 4, 'test', { onFatal })).rejects.toThrow('bad request');
        expect(op).toHaveBeenCalledTimes(1);
        expect(onFatal).toHaveBeenCalledTimes(1);
    });

    it('onAuthFailure throwing aborts the loop immediately — preserves the pre-lib handleAuthError behavior', async () => {
        const onAuthFailure = jest.fn((error: unknown, message: string) => {
            throw new Error(`aborted: ${message}`);
        });
        const op = jest.fn(async () => {
            throw Object.assign(new Error('expired'), { status: 403 });
        });

        await expect(withRetry(op, 4, 'test', { onAuthFailure })).rejects.toThrow('aborted:');
        expect(op).toHaveBeenCalledTimes(1);
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });

    it('onAuthFailure that does not throw falls through to the ordinary shouldRetry check', async () => {
        const onAuthFailure = jest.fn();
        const op = jest.fn(async () => {
            throw Object.assign(new Error('expired'), { status: 403 });
        });

        // 403 → shouldRetry=false too, so it still throws the original error — just not via onAuthFailure.
        await expect(withRetry(op, 4, 'test', { onAuthFailure })).rejects.toThrow('expired');
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });

    it('exhausts retries and calls onExhausted on the final attempt', async () => {
        jest.useFakeTimers();
        const onExhausted = jest.fn();
        const op = jest.fn(async () => {
            throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        });

        const promise = withRetry(op, 1, 'test', { onExhausted });
        promise.catch(() => undefined); // silence the unhandled-rejection warning before the assertion below awaits it
        await jest.advanceTimersByTimeAsync(1000);
        await expect(promise).rejects.toThrow('Network Error');
        expect(op).toHaveBeenCalledTimes(2);
        expect(onExhausted).toHaveBeenCalledWith(expect.objectContaining({ attempts: 2 }));
        jest.useRealTimers();
    });
});

describe('withTimeout', () => {
    it('resolves when the promise settles before the timeout', async () => {
        await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
    });

    it('rejects with a TIMEOUT-prefixed message when the promise is too slow', async () => {
        jest.useFakeTimers();
        const never = new Promise(() => undefined); // never settles — withTimeout must win the race
        const promise = withTimeout(never, 50, 'slow op');
        const assertion = expect(promise).rejects.toThrow('TIMEOUT: slow op timed out (50ms)');
        await jest.advanceTimersByTimeAsync(50);
        await assertion;
        jest.useRealTimers();
    });
});
