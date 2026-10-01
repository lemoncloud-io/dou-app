import { isNetworkError, retryOnNetworkError } from './retryOnNetworkError';

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('isNetworkError', () => {
    it('recognises a request that got no HTTP answer', () => {
        expect(isNetworkError(networkError())).toBe(true);
        expect(isNetworkError(new Error('ERR_NETWORK'))).toBe(true);
        expect(isNetworkError({ code: 'ERR_NETWORK' })).toBe(true);
    });

    it('does not treat a server answer or a non-error as one', () => {
        expect(isNetworkError(new Error('Request failed with status code 400'))).toBe(false);
        expect(isNetworkError(new Error('TIMEOUT: no response'))).toBe(false);
        expect(isNetworkError(null)).toBe(false);
    });
});

describe('retryOnNetworkError', () => {
    const wait = jest.fn(() => Promise.resolve());

    beforeEach(() => wait.mockClear());

    it('returns the first success without waiting', async () => {
        const task = jest.fn().mockResolvedValue('ok');

        await expect(retryOnNetworkError(task, { delays: [10, 20], wait })).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });

    it('retries after each delay while the network keeps failing, then succeeds', async () => {
        const task = jest
            .fn()
            .mockRejectedValueOnce(networkError())
            .mockRejectedValueOnce(networkError())
            .mockResolvedValue('ok');

        await expect(retryOnNetworkError(task, { delays: [10, 20, 40], wait })).resolves.toBe('ok');
        expect(task).toHaveBeenCalledTimes(3);
        expect(wait.mock.calls).toEqual([[10], [20]]);
    });

    it('throws the last network error once the delays run out', async () => {
        const last = networkError();
        const task = jest.fn().mockRejectedValueOnce(networkError()).mockRejectedValueOnce(last);

        await expect(retryOnNetworkError(task, { delays: [10], wait })).rejects.toBe(last);
        expect(task).toHaveBeenCalledTimes(2);
    });

    it('throws any other failure at once', async () => {
        const refused = new Error('Request failed with status code 400');
        const task = jest.fn().mockRejectedValue(refused);

        await expect(retryOnNetworkError(task, { delays: [10, 20], wait })).rejects.toBe(refused);
        expect(task).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });
});
