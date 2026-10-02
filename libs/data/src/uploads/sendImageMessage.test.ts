import type { UploadDirectTransfer } from '@lemoncloud/chatic-socials-api';
import { sendImageMessage, type SendImageOptions } from './sendImageMessage';
import type {
    ChatAttachmentSource,
    PreparedImageMirror,
    PresignedUploadStartResult,
    PresignedUploadTicket,
    PutPort,
    PutResult,
    SendImagePorts,
    ShellFileRef,
} from './types';

const SIGNED = 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=';
const SECRET_HEADER = 'x-amz-security-token-value';

const file = (name: string, type = 'image/jpeg', size = 100) => new File([new Uint8Array(size)], name, { type });

const prepared = (source: File, { thumbnail = true }: { thumbnail?: boolean } = {}): PreparedImageMirror => ({
    original: { file: source, width: 400, height: 300 },
    thumbnail: thumbnail ? { file: file(`${source.name}-thumb`, 'image/jpeg', 10), width: 40, height: 30 } : null,
});

const target = (slot: number, payload: 'o' | 't', generation = 1): UploadDirectTransfer => ({
    kind: 'presigned-put',
    method: 'PUT',
    url: `${SIGNED}${slot}-${payload}-${generation}`,
    headers: { 'content-type': 'image/jpeg', 'x-amz-security-token': SECRET_HEADER },
    maxBytes: 1000,
});

const ticket = (slot: number, generation = 1, withThumb = true): PresignedUploadTicket => ({
    upload: { id: `up-${slot}`, status: 'pending' },
    transfer: target(slot, 'o', generation),
    ...(withThumb ? { thumbnailTransfer: target(slot, 't', generation) } : {}),
});

const OK: PutResult = { kind: 'responded', httpStatus: 200 };

/** Ports where every call succeeds unless a test overrides it. */
const createPorts = (count: number) => {
    const ports = {
        prepare: jest.fn(async (source: File) => prepared(source)),
        start: jest.fn(
            async (input: Parameters<SendImagePorts['start']>[0]): Promise<PresignedUploadStartResult> => ({
                list: input.list.map((intent, i) =>
                    // A re-issue names the upload it renews; answer it with a second-generation ticket.
                    intent.id
                        ? ticket(Number(intent.id.slice(3)), 2, !!intent.thumbnail)
                        : ticket(i, 1, !!intent.thumbnail)
                ),
            })
        ),
        complete: jest.fn(async (input: Parameters<SendImagePorts['complete']>[0]) => ({
            list: input.list.map(item => ({
                id: item.id,
                status: item.failure ? ('failed' as const) : ('stored' as const),
            })),
        })),
        put: jest.fn<Promise<PutResult>, Parameters<PutPort>>(async () => OK),
        send: jest.fn(async () => ({ id: 'chat-1' })),
    };
    const files = Array.from({ length: count }, (_, i) => file(`p${i}.jpg`));
    return { ports, files };
};

const noWait: SendImageOptions = { wait: async () => undefined, log: () => undefined };

const putLabels = (put: jest.Mock) => put.mock.calls.map(call => call[2]);

describe('sendImageMessage', () => {
    it('sends three images as one message: one start, six PUTs, one complete, ids in picking order', async () => {
        const { ports, files } = createPorts(3);
        // Finish the PUTs out of order to show the message order does not follow completion order.
        ports.put.mockImplementation(async (_target, _file, label) => {
            if (label === 'slot-0/original') await new Promise(resolve => setTimeout(resolve, 5));
            return OK;
        });

        const result = await sendImageMessage(files, ports, noWait);

        expect(result).toEqual({ status: 'sent', uploadIds: ['up-0', 'up-1', 'up-2'], failedIndexes: [] });
        expect(ports.start).toHaveBeenCalledTimes(1);
        expect(ports.start.mock.calls[0][0].list).toEqual(
            files.map(source => ({
                name: source.name,
                contentType: 'image/jpeg',
                contentSize: 100,
                width: 400,
                height: 300,
                thumbnail: { contentType: 'image/jpeg', contentSize: 10, width: 40, height: 30 },
            }))
        );
        expect(ports.put).toHaveBeenCalledTimes(6);
        expect(ports.complete).toHaveBeenCalledTimes(1);
        expect(ports.complete).toHaveBeenCalledWith({ list: [{ id: 'up-0' }, { id: 'up-1' }, { id: 'up-2' }] });
        expect(ports.send).toHaveBeenCalledWith({ uploadIds: ['up-0', 'up-1', 'up-2'] });
    });

    it('hands a shell file and its poster to the PUT as the shell files they are', async () => {
        const { ports } = createPorts(0);
        const video: ShellFileRef = {
            uri: 'file:///cache/attach-pick/a/clip.mp4',
            name: 'clip.mp4',
            type: 'video/mp4',
            size: 5000,
            kind: 'video',
        };
        const poster: ShellFileRef = {
            ...video,
            uri: 'file:///cache/attach-pick/a/poster.jpg',
            name: 'poster.jpg',
            type: 'image/jpeg',
            size: 20,
        };
        const put = jest.fn<Promise<PutResult>, [unknown, ChatAttachmentSource, string]>(async () => OK);
        const shellPorts: SendImagePorts<ChatAttachmentSource> = {
            ...ports,
            prepare: async () => ({
                original: { file: video, width: 1920, height: 1080 },
                thumbnail: { file: poster, width: 400, height: 225 },
            }),
            put,
        };

        const result = await sendImageMessage([video], shellPorts, noWait);

        expect(result).toEqual({ status: 'sent', uploadIds: ['up-0'], failedIndexes: [] });
        expect(ports.start.mock.calls[0][0].list[0]).toEqual({
            name: 'clip.mp4',
            contentType: 'video/mp4',
            contentSize: 5000,
            width: 1920,
            height: 1080,
            thumbnail: { contentType: 'image/jpeg', contentSize: 20, width: 400, height: 225 },
        });
        expect(put.mock.calls.map(call => [call[1], call[2]])).toEqual([
            [video, 'slot-0/original'],
            [poster, 'slot-0/thumbnail'],
        ]);
    });

    it('prepares the files one at a time', async () => {
        const { ports, files } = createPorts(3);
        let inFlight = 0;
        let peak = 0;
        ports.prepare.mockImplementation(async source => {
            peak = Math.max(peak, ++inFlight);
            await new Promise(resolve => setTimeout(resolve, 1));
            inFlight--;
            return prepared(source);
        });

        await sendImageMessage(files, ports, noWait);

        expect(peak).toBe(1);
    });

    it('declares no thumbnail and PUTs none when preparation produced none', async () => {
        const { ports, files } = createPorts(1);
        ports.prepare.mockImplementation(async source => prepared(source, { thumbnail: false }));

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.start.mock.calls[0][0].list[0]).not.toHaveProperty('thumbnail');
        expect(putLabels(ports.put)).toEqual(['slot-0/original']);
        expect(result).toMatchObject({ status: 'sent', uploadIds: ['up-0'] });
    });

    it('keeps the slot when only its thumbnail PUT fails, and reports no failure for it', async () => {
        const { ports, files } = createPorts(1);
        ports.put.mockImplementation(async (_target, _file, label) =>
            label.endsWith('thumbnail') ? { kind: 'responded', httpStatus: 500 } : OK
        );

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.complete).toHaveBeenCalledWith({ list: [{ id: 'up-0' }] });
        expect(result).toEqual({ status: 'sent', uploadIds: ['up-0'], failedIndexes: [] });
    });

    it('reports a failed original to complete, skips its thumbnail, and sends the rest', async () => {
        const { ports, files } = createPorts(3);
        ports.put.mockImplementation(async (_target, _file, label) =>
            label === 'slot-1/original' ? { kind: 'responded', httpStatus: 500, providerCode: 'InternalError' } : OK
        );

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.complete).toHaveBeenCalledWith({
            list: [
                { id: 'up-0' },
                { id: 'up-1', failure: { source: 'storage', code: 'unknown', status: 500, reason: 'InternalError' } },
                { id: 'up-2' },
            ],
        });
        expect(putLabels(ports.put)).not.toContain('slot-1/thumbnail');
        expect(ports.send).toHaveBeenCalledWith({ uploadIds: ['up-0', 'up-2'] });
        expect(result).toEqual({ status: 'sent', uploadIds: ['up-0', 'up-2'], failedIndexes: [1] });
    });

    it('sends nothing and fails when no upload was stored', async () => {
        const { ports, files } = createPorts(2);
        ports.put.mockResolvedValue({ kind: 'responded', httpStatus: 500 });

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.complete).toHaveBeenCalledTimes(1);
        expect(ports.send).not.toHaveBeenCalled();
        expect(result).toEqual({ status: 'failed', reason: 'no-stored-upload', failedSlots: 2 });
    });

    it('treats a slot rejected at start as failed and leaves it out of complete', async () => {
        const { ports, files } = createPorts(2);
        ports.start.mockResolvedValueOnce({
            list: [{ upload: { status: 'failed', error: 'unsupported type' } }, ticket(1)],
        });

        const result = await sendImageMessage(files, ports, noWait);

        expect(putLabels(ports.put)).toEqual(['slot-1/original', 'slot-1/thumbnail']);
        expect(ports.complete).toHaveBeenCalledWith({ list: [{ id: 'up-1' }] });
        expect(result).toEqual({ status: 'sent', uploadIds: ['up-1'], failedIndexes: [0] });
    });

    it('sends only the thumbnail of an upload the server already stores, and still settles it', async () => {
        const { ports, files } = createPorts(1);
        ports.start.mockResolvedValueOnce({
            list: [{ upload: { id: 'up-0', status: 'stored' }, thumbnailTransfer: target(0, 't') }],
        });

        const result = await sendImageMessage(files, ports, noWait);

        expect(putLabels(ports.put)).toEqual(['slot-0/thumbnail']);
        expect(ports.complete).toHaveBeenCalledWith({ list: [{ id: 'up-0' }] });
        expect(result).toMatchObject({ status: 'sent', uploadIds: ['up-0'] });
    });

    describe('403 re-issue', () => {
        it('re-issues that slot once with its id and PUTs to the new ticket', async () => {
            const { ports, files } = createPorts(2);
            ports.put.mockImplementation(async (put, _file, label) =>
                label === 'slot-1/original' && put.url.endsWith('-1') ? { kind: 'responded', httpStatus: 403 } : OK
            );

            const result = await sendImageMessage(files, ports, noWait);

            expect(ports.start).toHaveBeenCalledTimes(2);
            expect(ports.start.mock.calls[1][0].list).toEqual([
                expect.objectContaining({ id: 'up-1', name: 'p1.jpg' }),
            ]);
            const slot1 = ports.put.mock.calls.filter(call => call[2].startsWith('slot-1')).map(call => call[0].url);
            expect(slot1).toEqual([`${SIGNED}1-o-1`, `${SIGNED}1-o-2`, `${SIGNED}1-t-2`]);
            expect(result).toMatchObject({ status: 'sent', uploadIds: ['up-0', 'up-1'] });
        });

        it('fails the slot on a second 403 without a second re-issue', async () => {
            const { ports, files } = createPorts(1);
            ports.put.mockResolvedValue({ kind: 'responded', httpStatus: 403 });

            const result = await sendImageMessage(files, ports, noWait);

            expect(ports.start).toHaveBeenCalledTimes(2);
            expect(ports.put).toHaveBeenCalledTimes(2);
            expect(ports.complete).toHaveBeenCalledWith({
                list: [{ id: 'up-0', failure: { source: 'storage', code: 'expired', status: 403 } }],
            });
            expect(result).toMatchObject({ status: 'failed', reason: 'no-stored-upload' });
        });

        it('fails only that slot when the re-issue itself fails', async () => {
            const { ports, files } = createPorts(2);
            ports.start.mockImplementationOnce(async () => ({ list: [ticket(0), ticket(1)] }));
            ports.start.mockRejectedValueOnce(new Error('socket down'));
            ports.put.mockImplementation(async (_put, _file, label) =>
                label === 'slot-0/original' ? { kind: 'responded', httpStatus: 403 } : OK
            );

            const result = await sendImageMessage(files, ports, noWait);

            expect(result).toEqual({ status: 'sent', uploadIds: ['up-1'], failedIndexes: [0] });
        });
    });

    describe('network retry', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const run = async (ports: SendImagePorts, files: File[]) => {
            const pending = sendImageMessage(files, ports, { log: () => undefined });
            // Walk the clock forward step by step so every awaited timer is released in turn.
            for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(500);
            return pending;
        };

        it('retries the same ticket twice, after 1s and then 3s, and succeeds on the third try', async () => {
            const { ports, files } = createPorts(1);
            ports.prepare.mockImplementation(async source => prepared(source, { thumbnail: false }));
            const at: number[] = [];
            ports.put.mockImplementation(async () => {
                at.push(Date.now());
                return at.length < 3 ? { kind: 'no-response', reason: 'network' } : OK;
            });

            const result = await run(ports, files);

            expect(ports.put.mock.calls.map(call => call[0].url)).toEqual(Array(3).fill(`${SIGNED}0-o-1`));
            expect(at[1] - at[0]).toBe(1000);
            expect(at[2] - at[1]).toBe(3000);
            expect(result).toMatchObject({ status: 'sent', uploadIds: ['up-0'] });
        });

        it('fails the slot after the third network failure', async () => {
            const { ports, files } = createPorts(1);
            ports.prepare.mockImplementation(async source => prepared(source, { thumbnail: false }));
            ports.put.mockResolvedValue({ kind: 'no-response', reason: 'network' });

            const result = await run(ports, files);

            expect(ports.put).toHaveBeenCalledTimes(3);
            expect(ports.complete).toHaveBeenCalledWith({
                list: [{ id: 'up-0', failure: { source: 'client', code: 'network', reason: 'network' } }],
            });
            expect(result).toMatchObject({ status: 'failed', reason: 'no-stored-upload' });
        });

        it.each(['source', 'system'] as const)('does not retry a %s failure', async reason => {
            const { ports, files } = createPorts(1);
            ports.prepare.mockImplementation(async source => prepared(source, { thumbnail: false }));
            ports.put.mockResolvedValue({ kind: 'no-response', reason });

            await run(ports, files);

            expect(ports.put).toHaveBeenCalledTimes(1);
        });
    });

    it('counts 412 (already stored) as a successful PUT', async () => {
        const { ports, files } = createPorts(1);
        ports.put.mockResolvedValue({ kind: 'responded', httpStatus: 412 });

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.complete).toHaveBeenCalledWith({ list: [{ id: 'up-0' }] });
        expect(result).toMatchObject({ status: 'sent', uploadIds: ['up-0'] });
    });

    it('treats a PUT port that throws as a transfer that never answered', async () => {
        const { ports, files } = createPorts(1);
        ports.put.mockRejectedValue(new Error('bridge gone'));

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.put).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ status: 'failed', reason: 'no-stored-upload' });
    });

    it.each([
        ['start', (ports: ReturnType<typeof createPorts>['ports']) => ports.start.mockRejectedValue(new Error('x'))],
        [
            'complete',
            (ports: ReturnType<typeof createPorts>['ports']) => ports.complete.mockRejectedValue(new Error('x')),
        ],
        ['send', (ports: ReturnType<typeof createPorts>['ports']) => ports.send.mockRejectedValue(new Error('x'))],
    ])('fails the whole message when %s fails, so a retry starts over', async (_op, breakIt) => {
        const { ports, files } = createPorts(2);
        breakIt(ports);

        const result = await sendImageMessage(files, ports, noWait);

        expect(result).toMatchObject({ status: 'failed', reason: 'socket' });
    });

    it('fails the whole message when start answers with a different number of slots', async () => {
        const { ports, files } = createPorts(2);
        ports.start.mockResolvedValueOnce({ list: [ticket(0)] });

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.put).not.toHaveBeenCalled();
        expect(result).toMatchObject({ status: 'failed', reason: 'socket' });
    });

    it('starts over from preparation when called again after a failed send', async () => {
        const { ports, files } = createPorts(2);
        ports.send.mockRejectedValueOnce(new Error('socket down'));

        const first = await sendImageMessage(files, ports, noWait);
        const second = await sendImageMessage(files, ports, noWait);

        expect(first).toMatchObject({ status: 'failed', reason: 'socket' });
        expect(second).toMatchObject({ status: 'sent', uploadIds: ['up-0', 'up-1'] });
        expect(ports.prepare).toHaveBeenCalledTimes(4);
        expect(ports.start).toHaveBeenCalledTimes(2);
    });

    it('never has more than three PUTs in flight, and PUTs a thumbnail only after its original', async () => {
        const { ports, files } = createPorts(6);
        let inFlight = 0;
        let peak = 0;
        const order: string[] = [];
        ports.put.mockImplementation(async (_target, _file, label) => {
            peak = Math.max(peak, ++inFlight);
            order.push(`start ${label}`);
            await new Promise(resolve => setTimeout(resolve, 2));
            order.push(`end ${label}`);
            inFlight--;
            return OK;
        });

        await sendImageMessage(files, ports, noWait);

        expect(peak).toBe(3);
        for (let slot = 0; slot < 6; slot++) {
            expect(order.indexOf(`start slot-${slot}/thumbnail`)).toBeGreaterThan(
                order.indexOf(`end slot-${slot}/original`)
            );
        }
    });

    it('declares the prepared type and size, not the picked file’s (HEIC re-encoded as JPEG)', async () => {
        const { ports } = createPorts(0);
        const heic = file('IMG_0001.HEIC', 'image/heic', 900);
        ports.prepare.mockImplementation(async () => ({
            original: { file: file('IMG_0001.jpg', 'image/jpeg', 300), width: 10, height: 10 },
            thumbnail: null,
        }));

        await sendImageMessage([heic], ports, noWait);

        expect(ports.start.mock.calls[0][0].list[0]).toMatchObject({ contentType: 'image/jpeg', contentSize: 300 });
    });

    it('uses the first ten files only', async () => {
        const { ports, files } = createPorts(12);

        const result = await sendImageMessage(files, ports, noWait);

        expect(ports.prepare).toHaveBeenCalledTimes(10);
        expect(ports.start.mock.calls[0][0].list).toHaveLength(10);
        expect(result).toMatchObject({ status: 'sent' });
    });

    it('omits dimensions it could not measure', async () => {
        const { ports } = createPorts(0);
        ports.prepare.mockImplementation(async source => ({
            original: { file: source, width: 0, height: 0 },
            thumbnail: null,
        }));

        await sendImageMessage([file('x.jpg')], ports, noWait);

        const intent = ports.start.mock.calls[0][0].list[0];
        expect(intent).not.toHaveProperty('width');
        expect(intent).not.toHaveProperty('height');
    });

    it('never logs a ticket URL or header value, on any path', async () => {
        const logged: unknown[] = [];
        const log = (message: string, data?: Record<string, unknown>) => logged.push(message, data);
        const { ports, files } = createPorts(3);
        ports.put.mockImplementation(async (_target, _file, label) => {
            if (label === 'slot-0/original') return { kind: 'responded', httpStatus: 403 };
            if (label === 'slot-1/original') return { kind: 'responded', httpStatus: 500 };
            if (label === 'slot-2/thumbnail') throw new Error(`failed PUT ${SIGNED}`);
            return OK;
        });

        await sendImageMessage(files, ports, { log, wait: async () => undefined });
        ports.send.mockRejectedValueOnce(new Error(`send failed near ${SIGNED}`));
        await sendImageMessage(files, ports, { log, wait: async () => undefined });

        const text = JSON.stringify(logged);
        expect(logged.length).toBeGreaterThan(0);
        expect(text).not.toContain('amazonaws');
        expect(text).not.toContain(SECRET_HEADER);
    });
});
