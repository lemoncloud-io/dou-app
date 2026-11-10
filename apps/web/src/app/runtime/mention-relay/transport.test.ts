import { createRelayTransport } from './transport';
import type { RelayEvent } from './relay';

const event: RelayEvent = {
    version: 1,
    cloudId: 'cloud',
    channelId: 'public-id',
    messageId: 'public-id:11',
    chatNo: 11,
    parentId: null,
    senderId: 'me',
    content: 'hello',
    mentionUserIds: ['me'],
};
const response = (status: number, value: unknown = { accepted: true }): Response =>
    ({ status, ok: status < 400, json: async () => value }) as Response;

describe('local relay transport', () => {
    it('uses fixed same-origin endpoints and the local nonce without app credentials or destinations', async () => {
        const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => response(200));
        const transport = createRelayTransport(request);
        await transport.config();
        await transport.register(
            'nonce',
            { cloudId: 'cloud', channelId: 'public-id', channelName: 'public', viewerIds: ['me'] },
            10
        );
        await transport.event('nonce', event);
        expect(request.mock.calls.map(call => call[0])).toEqual([
            '/__dou_mentions/config',
            '/__dou_mentions/register',
            '/__dou_mentions/events',
        ]);
        expect(request.mock.calls[2][1]).toMatchObject({
            method: 'POST',
            credentials: 'omit',
            cache: 'no-store',
            headers: { 'content-type': 'application/json', 'x-dou-mention-token': 'nonce' },
            body: JSON.stringify(event),
        });
    });

    it('retries transient transport failures with the same message identity at most three times', async () => {
        const request = jest
            .fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response(200));
        const pause = jest.fn(async () => undefined);
        await createRelayTransport(request, pause).event('nonce', event);
        expect(request).toHaveBeenCalledTimes(3);
        expect(pause.mock.calls).toEqual([[500], [1000]]);
        expect(request.mock.calls.every(call => call[1].body === JSON.stringify(event))).toBe(true);
    });

    it('does not retry disabled, mismatched or unauthorized requests', async () => {
        for (const [status, reason] of [
            [200, 'disabled'],
            [409, 'scope-mismatch'],
        ] as const) {
            const request = jest.fn(async () => response(status, { accepted: false, reason }));
            expect(await createRelayTransport(request).event('nonce', event)).toEqual({ accepted: false, reason });
            expect(request).toHaveBeenCalledTimes(1);
        }
        const request = jest.fn(async () => response(403));
        await expect(createRelayTransport(request).event('nonce', event)).rejects.toThrow('refused');
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('gives up after the bounded transient retry budget', async () => {
        const request = jest.fn(async () => response(429));
        const pause = jest.fn(async () => undefined);
        await expect(createRelayTransport(request, pause).event('nonce', event)).rejects.toThrow('transport failed');
        expect(request).toHaveBeenCalledTimes(3);
    });
});

describe('transport lifetime guard', () => {
    it('does not retry after logout or a changed account', async () => {
        let active = true;
        const request = jest.fn(async () => response(503));
        const pause = async () => {
            active = false;
        };
        await expect(createRelayTransport(request, pause).event('nonce', event, () => active)).rejects.toThrow(
            'stopped'
        );
        expect(request).toHaveBeenCalledTimes(1);
    });
});

describe('thread context on the transport boundary', () => {
    it('serializes raw parent context explicitly for channel messages and thread replies', async () => {
        const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => response(200));
        const transport = createRelayTransport(request);
        for (const parentId of [null, '7', 'public-id:7']) await transport.event('nonce', { ...event, parentId });
        expect(request.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).parentId)).toEqual([
            null,
            '7',
            'public-id:7',
        ]);
    });
});
