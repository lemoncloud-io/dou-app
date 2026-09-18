import { completePendingUploads, isReissuable, reissueTransfer } from './pending';

import type { UploadService } from 'lemon-model/upload';

const service = () =>
    ({
        start: jest.fn(),
        send: jest.fn(),
        complete: jest.fn(),
        read: jest.fn(),
    }) as unknown as UploadService & { start: jest.Mock; complete: jest.Mock };

describe('completePendingUploads', () => {
    it('settles what was left unconfirmed', async () => {
        const api = service();
        api.complete.mockResolvedValue({ list: [{ id: '1', status: 'stored' }] });

        await expect(completePendingUploads(api, [{ id: '1' }])).resolves.toEqual([{ id: '1', status: 'stored' }]);
        expect(api.complete).toHaveBeenCalledWith({ list: [{ id: '1' }] });
    });

    // Nothing to repair must not become an empty round trip on every launch.
    it('does not call the server when there is nothing pending', async () => {
        const api = service();

        await expect(completePendingUploads(api, [])).resolves.toEqual([]);
        expect(api.complete).not.toHaveBeenCalled();
    });

    // The caller keeps its records and retries next run — which only works if this reports failure.
    it('propagates a failure rather than reporting success', async () => {
        const api = service();
        api.complete.mockRejectedValue(new Error('0 NETWORK - offline'));

        await expect(completePendingUploads(api, [{ id: '1' }])).rejects.toThrow('0 NETWORK - offline');
    });
});

describe('isReissuable', () => {
    it('is true only for a storage url that went bad', () => {
        expect(isReissuable({ source: 'storage', code: 'expired' })).toBe(true);
        expect(isReissuable({ source: 'storage', code: 'signature' })).toBe(true);
    });

    it('is false for anything about the bytes themselves, or for our own API', () => {
        expect(isReissuable({ source: 'storage', code: 'checksum' })).toBe(false);
        expect(isReissuable({ source: 'storage', code: 'too-large' })).toBe(false);
        expect(isReissuable({ source: 'api', code: 'expired' })).toBe(false);
        expect(isReissuable(undefined)).toBe(false);
    });
});

describe('reissueTransfer', () => {
    const body = { id: '1000009', name: 'a.png', contentType: 'image/png', contentSize: 10 };

    it('asks with the id filled in, which keeps the slot', async () => {
        const api = service();
        api.start.mockResolvedValue({
            list: [{ upload: { id: '1000009', status: 'pending' }, transfer: { kind: 'presigned-put' } }],
        });

        const ticket = await reissueTransfer(api, body, ['presigned-put']);

        expect(api.start).toHaveBeenCalledWith({ list: [body], transfers: ['presigned-put'] });
        expect(ticket?.upload.id).toBe('1000009');
    });

    // No instruction means the ticket is gone, already stored, or refused — none of them retryable.
    it('is undefined when the server hands back no instruction', async () => {
        const api = service();
        api.start.mockResolvedValue({ list: [{ upload: { id: '1000009', status: 'failed' } }] });

        await expect(reissueTransfer(api, body, ['presigned-put'])).resolves.toBeUndefined();
    });
});
