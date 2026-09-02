import { NETWORK_LOG_TAG, withNetworkLog } from './networkLog';

import type { HttpLogSink } from './networkLog';

const createSink = (): jest.Mocked<HttpLogSink> => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
});

describe('withNetworkLog', () => {
    const req = { method: 'POST' as const, url: 'https://api.test/x', params: { q: 1 }, body: { password: 'secret' } };

    it('no sink → no logging, response still passes through', async () => {
        const res = { data: { ok: true }, status: 200 };
        const returned = await withNetworkLog(req, async () => res, undefined);

        expect(returned).toBe(res);
    });

    it('logs a debug entry on success with RAW fields — redact/truncate is the sink’s job now', async () => {
        const sink = createSink();
        const res = { data: { ok: true }, status: 200 };
        const returned = await withNetworkLog(req, async () => res, sink);

        expect(returned).toBe(res);
        expect(sink.debug).toHaveBeenCalledTimes(1);
        const [tag, , fields] = sink.debug.mock.calls[0];
        expect(tag).toBe(NETWORK_LOG_TAG);
        expect(fields).toMatchObject({ outcome: 'success', method: 'POST', url: req.url, status: 200 });
        expect(fields.requestBody).toEqual({ password: 'secret' });
        expect(typeof fields.durationMs).toBe('number');
    });

    it('omits the response body on success — bulk without diagnostic value, and these entries now get uploaded', async () => {
        const sink = createSink();
        await withNetworkLog(req, async () => ({ data: { huge: 'payload' }, status: 200 }), sink);

        const [, , fields] = sink.debug.mock.calls[0];
        expect(fields).not.toHaveProperty('responseData');
    });

    it('still attaches the response body on failure — that is where it explains something', async () => {
        const sink = createSink();
        const failure = Object.assign(new Error('nope'), { response: { status: 500, data: { reason: 'db down' } } });

        await expect(withNetworkLog(req, async () => Promise.reject(failure), sink)).rejects.toBe(failure);

        const [, , fields] = sink.error.mock.calls[0];
        expect(fields.responseData).toEqual({ reason: 'db down' });
    });

    it('escalates to warn when the 200 body carries an error field', async () => {
        const sink = createSink();
        await withNetworkLog(req, async () => ({ data: { error: 'BAD_REQUEST' }, status: 200 }), sink);

        expect(sink.warn).toHaveBeenCalledTimes(1);
        expect(sink.debug).not.toHaveBeenCalled();
    });

    it('keeps a record `error` at debug when the caller passed allowRecordError', async () => {
        // `POST /clouds/{id}/release` answers 200 with the released cloud, whose own `error` column
        // holds its last provisioning trace — a successful call, so not a warn.
        const sink = createSink();
        await withNetworkLog(
            { ...req, allowRecordError: true },
            async () => ({ data: { id: '1000047', error: '.accountNo[#mock:1] is invalid' }, status: 200 }),
            sink
        );

        expect(sink.warn).not.toHaveBeenCalled();
        expect(sink.debug).toHaveBeenCalledTimes(1);
    });

    it('logs an error entry with status/code/responseData and rethrows the original error', async () => {
        const sink = createSink();
        const axiosError = Object.assign(new Error('Request failed'), {
            code: 'ERR_BAD_RESPONSE',
            response: { status: 500, data: { error: 'boom' } },
        });

        await expect(
            withNetworkLog(
                req,
                async () => {
                    throw axiosError;
                },
                sink
            )
        ).rejects.toBe(axiosError);

        expect(sink.error).toHaveBeenCalledTimes(1);
        const [tag, message, fields] = sink.error.mock.calls[0];
        expect(tag).toBe(NETWORK_LOG_TAG);
        // The cause belongs in the message: a breadcrumb line is read without expanding `data`.
        expect(message).toContain('failed (500)');
        expect(fields.error).toBe(axiosError);
        expect(fields).toMatchObject({
            outcome: 'error',
            method: 'POST',
            status: 500,
            errorCode: '500',
            responseData: { error: 'boom' },
        });
        expect(fields.requestBody).toEqual({ password: 'secret' });
    });

    it('falls back to the axios error code when no status is present', async () => {
        const sink = createSink();
        const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

        await expect(
            withNetworkLog(
                req,
                async () => {
                    throw networkError;
                },
                sink
            )
        ).rejects.toBe(networkError);

        const [, message, fields] = sink.error.mock.calls[0];
        expect(fields.errorCode).toBe('ERR_NETWORK');
        // No response came back — the message names the transport code so the two failure classes
        // (server rejected vs never left) are told apart at a glance.
        expect(message).toContain('failed (ERR_NETWORK)');
    });
});
