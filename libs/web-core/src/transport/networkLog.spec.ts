jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@chatic/bridges';

import { NETWORK_LOG_TAG, withNetworkLog } from './networkLog';

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('withNetworkLog', () => {
    beforeEach(() => jest.clearAllMocks());

    const req = { method: 'POST' as const, url: 'https://api.test/x', params: { q: 1 }, body: { password: 'secret' } };

    it('logs a debug entry on success and passes the response through', async () => {
        const res = { data: { ok: true }, status: 200 };
        const returned = await withNetworkLog(req, async () => res);

        expect(returned).toBe(res);
        expect(mockLogger.debug).toHaveBeenCalledTimes(1);
        const [tag, , fields] = mockLogger.debug.mock.calls[0];
        expect(tag).toBe(NETWORK_LOG_TAG);
        expect(fields).toMatchObject({ outcome: 'success', method: 'POST', url: req.url, status: 200 });
        expect((fields as { requestBody: unknown }).requestBody).toEqual({ password: '[REDACTED]' });
        expect(typeof (fields as { durationMs: number }).durationMs).toBe('number');
    });

    it('escalates to warn when the 200 body carries an error field', async () => {
        await withNetworkLog(req, async () => ({ data: { error: 'BAD_REQUEST' }, status: 200 }));

        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('logs an error entry with status/code/responseData and rethrows the original error', async () => {
        const axiosError = Object.assign(new Error('Request failed'), {
            code: 'ERR_BAD_RESPONSE',
            response: { status: 500, data: { error: 'boom' } },
        });

        await expect(
            withNetworkLog(req, async () => {
                throw axiosError;
            })
        ).rejects.toBe(axiosError);

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        const [tag, message, options] = mockLogger.error.mock.calls[0];
        expect(tag).toBe(NETWORK_LOG_TAG);
        // The cause belongs in the message: a breadcrumb line is read without
        // expanding `data`.
        expect(message).toContain('failed (500)');
        const { error, data } = options as { error: unknown; data: Record<string, unknown> };
        expect(error).toBe(axiosError);
        expect(data).toMatchObject({
            outcome: 'error',
            method: 'POST',
            status: 500,
            errorCode: '500',
            responseData: { error: 'boom' },
        });
        expect(data.requestBody).toEqual({ password: '[REDACTED]' });
    });

    it('falls back to the axios error code when no status is present', async () => {
        const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

        await expect(
            withNetworkLog(req, async () => {
                throw networkError;
            })
        ).rejects.toBe(networkError);

        const [, message, options] = mockLogger.error.mock.calls[0];
        expect((options as { data: Record<string, unknown> }).data.errorCode).toBe('ERR_NETWORK');
        // No response came back — the message names the transport code so the two
        // failure classes (server rejected vs never left) are told apart at a glance.
        expect(message).toContain('failed (ERR_NETWORK)');
    });
});
