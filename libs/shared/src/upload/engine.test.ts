import { browserExecutors, createUploadEngine } from './engine';

import type { UploadService } from 'lemon-model/upload';

const service = () =>
    ({
        start: jest.fn().mockResolvedValue({ list: [] }),
        send: jest.fn(),
        complete: jest.fn().mockResolvedValue({ list: [] }),
        read: jest.fn(),
    }) as unknown as UploadService & { start: jest.Mock };

describe('browserExecutors', () => {
    // The order is the policy: the server takes the first method it can also do and never falls back.
    it('offers presigned before inline', () => {
        expect(browserExecutors({ service: service() }).map(e => e.kind)).toEqual(['presigned-put', 'inline']);
    });

    it('offers presigned alone when the shell cannot hold the bytes', () => {
        expect(browserExecutors({ service: service(), inline: false }).map(e => e.kind)).toEqual(['presigned-put']);
    });
});

describe('createUploadEngine', () => {
    it('declares exactly what its executors can do', async () => {
        const api = service();

        await createUploadEngine({ service: api }).upload([]);

        expect(api.start).toHaveBeenCalledWith({ list: [], transfers: ['presigned-put', 'inline'] });
    });

    // A shell whose bytes never enter this process declares only presigned, so an inline
    // instruction comes back as an explicit refusal instead of an impossible transfer.
    it('lets a shell replace the set entirely', async () => {
        const api = service();
        const native = { kind: 'presigned-put' as const, run: jest.fn() };

        await createUploadEngine({ service: api, executors: [native] }).upload([]);

        expect(api.start).toHaveBeenCalledWith({ list: [], transfers: ['presigned-put'] });
    });
});
