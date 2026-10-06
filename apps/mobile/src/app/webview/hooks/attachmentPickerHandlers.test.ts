import type { OnPickAttachmentsPayload, OnPrepareVideoPayload, OnReadAttachmentPayload } from '@chatic/app-messages';
import type { IAttachmentPickerBridge } from '../../bridge';
import type { ILogService } from '../../services';

import { createAttachmentPickerHandlers } from './attachmentPickerHandlers';

// The real bridge barrel loads every native module wrapper; the handlers receive the picker by
// injection and need nothing else from it at runtime.
jest.mock('../../bridge', () => ({}));

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const pickDir = 'file:///data/user/0/io.chatic.dou/cache/attach-pick/7f3c';

const picked: OnPickAttachmentsPayload = {
    items: [
        {
            kind: 'image',
            uri: `${pickDir}/IMG_0001.jpg`,
            name: 'IMG_0001.jpg',
            contentType: 'image/jpeg',
            size: 5,
            width: 40,
            height: 30,
        },
        {
            kind: 'video',
            uri: `${pickDir}/video-20261001-101500.mp4`,
            name: 'video-20261001-101500.mp4',
            contentType: 'video/mp4',
            size: 1024,
        },
    ],
    refused: [{ name: 'huge.pdf', kind: 'file', reason: 'too-large' }],
};

const photo: OnReadAttachmentPayload = {
    base64: 'Ynl0ZXM=',
    mimeType: 'image/jpeg',
    fileName: 'IMG_0001.jpg',
    width: 40,
    height: 30,
};

const prepared: OnPrepareVideoPayload = {
    file: {
        uri: `${pickDir}/IMG_0001.mp4`,
        name: 'IMG_0001.mp4',
        contentType: 'video/mp4',
        size: 2048,
        width: 1920,
        height: 1080,
    },
    poster: {
        uri: `${pickDir}/poster.jpg`,
        base64: 'cG9zdGVy',
        contentType: 'image/jpeg',
        size: 300,
        width: 400,
        height: 225,
    },
};

const frame = { base64: 'anBlZw==', contentType: 'image/jpeg' as const, width: 400, height: 225 };

const createPickerMock = (): jest.Mocked<IAttachmentPickerBridge> => ({
    isAvailable: true,
    pick: jest.fn().mockResolvedValue(picked),
    prepareVideo: jest.fn().mockResolvedValue(prepared),
    readAttachment: jest.fn().mockResolvedValue(photo),
    canReadVideoFrame: true,
    readVideoFrame: jest.fn().mockResolvedValue(frame),
});

const maxBytes = { image: 20 * 1024 * 1024, video: 300 * 1024 * 1024, file: 50 * 1024 * 1024 };

const message = <T>(type: string, data: T) => ({ type, data }) as any;

const rejection = (code: string | undefined, text = 'boom') => Object.assign(new Error(text), code ? { code } : {});

describe('createAttachmentPickerHandlers', () => {
    let picker: jest.Mocked<IAttachmentPickerBridge>;
    let logger: jest.Mocked<ILogService>;

    beforeEach(() => {
        picker = createPickerMock();
        logger = createLoggerMock();
    });

    const handlers = () => createAttachmentPickerHandlers(picker, logger);

    describe('PickAttachments', () => {
        const pick = (data: unknown) => handlers().handlePickAttachments(message('PickAttachments', data));

        it('passes the source, limit and ceilings through and answers with what was picked', async () => {
            const reply = await pick({ source: 'media', selectionLimit: 7, maxBytes });

            expect(picker.pick).toHaveBeenCalledWith('media', 7, maxBytes);
            expect(reply).toEqual({ type: 'OnPickAttachments', success: true, data: picked });
        });

        it('answers a cancelled picker as a success with nothing picked', async () => {
            picker.pick.mockResolvedValueOnce({ items: [], refused: [] });

            const reply = await pick({ source: 'document', selectionLimit: 10, maxBytes });

            expect(reply).toEqual({ type: 'OnPickAttachments', success: true, data: { items: [], refused: [] } });
        });

        it('hands native only the three ceilings, whatever else the object carried', async () => {
            await pick({ source: 'document', selectionLimit: 1, maxBytes: { ...maxBytes, extra: 'x' } });

            expect(picker.pick).toHaveBeenCalledWith('document', 1, maxBytes);
        });

        it.each([
            ['no payload', undefined],
            ['an unknown source', { source: 'camera', selectionLimit: 1, maxBytes }],
            ['a missing source', { selectionLimit: 1, maxBytes }],
            ['a zero limit', { source: 'media', selectionLimit: 0, maxBytes }],
            ['a fractional limit', { source: 'media', selectionLimit: 2.5, maxBytes }],
            ['a limit given as a string', { source: 'media', selectionLimit: '3', maxBytes }],
            ['no ceilings', { source: 'media', selectionLimit: 1 }],
            ['a missing ceiling', { source: 'media', selectionLimit: 1, maxBytes: { image: 1, video: 1 } }],
            ['a zero ceiling', { source: 'media', selectionLimit: 1, maxBytes: { ...maxBytes, video: 0 } }],
            ['an infinite ceiling', { source: 'media', selectionLimit: 1, maxBytes: { ...maxBytes, file: Infinity } }],
        ])('refuses %s with INVALID before reaching native code', async (_label, data) => {
            const reply = await pick(data);

            expect(reply).toEqual({
                type: 'OnPickAttachments',
                success: false,
                error: { code: 'INVALID', message: expect.any(String) },
            });
            expect(picker.pick).not.toHaveBeenCalled();
        });

        it.each(['BUSY', 'INTERNAL'])('carries the native %s into the envelope', async code => {
            picker.pick.mockRejectedValueOnce(rejection(code, 'native said no'));

            const reply = await pick({ source: 'media', selectionLimit: 1, maxBytes });

            expect(reply).toEqual({
                type: 'OnPickAttachments',
                success: false,
                error: { code, message: 'native said no' },
            });
        });

        // NOT_FOUND would tell the web this app has no picker at all, and it would stop asking.
        it.each(['NOT_FOUND', 'E_UNKNOWN', undefined])('reports a native %s as INTERNAL', async code => {
            picker.pick.mockRejectedValueOnce(rejection(code));

            const reply = await pick({ source: 'media', selectionLimit: 1, maxBytes });

            expect(reply.error?.code).toBe('INTERNAL');
        });

        it('logs counts, never a picked file name', async () => {
            await pick({ source: 'document', selectionLimit: 3, maxBytes });

            const logged = logger.info.mock.calls.map(call => call.join(' ')).join('\n');
            expect(logged).toContain('2 picked, 1 refused');
            expect(logged).not.toContain('huge.pdf');
            expect(logged).not.toContain('video-20261001');
        });
    });

    describe('PrepareVideo', () => {
        const prepare = (data: unknown) => handlers().handlePrepareVideo(message('PrepareVideo', data));

        it('passes the uri and answers with the file and its poster', async () => {
            const uri = `${pickDir}/IMG_0001.MOV`;

            const reply = await prepare({ uri });

            expect(picker.prepareVideo).toHaveBeenCalledWith(uri);
            expect(reply).toEqual({ type: 'OnPrepareVideo', success: true, data: prepared });
        });

        it('answers a video without a poster as a success', async () => {
            picker.prepareVideo.mockResolvedValueOnce({ ...prepared, poster: null });

            const reply = await prepare({ uri: prepared.file.uri });

            expect(reply.success).toBe(true);
            expect((reply.data as OnPrepareVideoPayload).poster).toBeNull();
        });

        it.each([
            ['no payload', undefined],
            ['a missing uri', {}],
            ['an empty uri', { uri: '' }],
            ['a non-string uri', { uri: 42 }],
        ])('refuses %s with INVALID before reaching native code', async (_label, data) => {
            const reply = await prepare(data);

            expect(reply.error?.code).toBe('INVALID');
            expect(picker.prepareVideo).not.toHaveBeenCalled();
        });

        it.each(['TOO_LARGE', 'UNSUPPORTED', 'SOURCE', 'SYSTEM', 'INVALID'])(
            'carries the native %s into the envelope',
            async code => {
                picker.prepareVideo.mockRejectedValueOnce(rejection(code, 'native said no'));

                const reply = await prepare({ uri: prepared.file.uri });

                expect(reply).toEqual({
                    type: 'OnPrepareVideo',
                    success: false,
                    error: { code, message: 'native said no' },
                });
            }
        );

        it.each(['NOT_FOUND', 'INTERNAL', undefined])('reports a native %s as SYSTEM', async code => {
            picker.prepareVideo.mockRejectedValueOnce(rejection(code));

            const reply = await prepare({ uri: prepared.file.uri });

            expect(reply.error?.code).toBe('SYSTEM');
        });

        it('never logs the file path', async () => {
            picker.prepareVideo.mockRejectedValueOnce(rejection('SOURCE', `cannot read ${pickDir}/IMG_0001.MOV`));

            await prepare({ uri: `${pickDir}/IMG_0001.MOV` });

            const logged = [...logger.info.mock.calls, ...logger.warn.mock.calls]
                .map(call => call.join(' '))
                .join('\n');
            expect(logged).toContain('SOURCE');
            expect(logged).not.toContain('attach-pick');
        });
    });

    describe('ReadAttachment', () => {
        const read = (data: unknown) => handlers().handleReadAttachment(message('ReadAttachment', data));

        it('passes the uri and answers with the photo', async () => {
            const uri = `${pickDir}/IMG_0001.jpg`;

            const reply = await read({ uri });

            expect(picker.readAttachment).toHaveBeenCalledWith(uri);
            expect(reply).toEqual({ type: 'OnReadAttachment', success: true, data: photo });
        });

        it.each([
            ['no payload', undefined],
            ['a missing uri', {}],
            ['an empty uri', { uri: '' }],
        ])('refuses %s with INVALID before reaching native code', async (_label, data) => {
            const reply = await read(data);

            expect(reply.error?.code).toBe('INVALID');
            expect(picker.readAttachment).not.toHaveBeenCalled();
        });

        it.each(['INVALID', 'SOURCE', 'INTERNAL'])('carries the native %s into the envelope', async code => {
            picker.readAttachment.mockRejectedValueOnce(rejection(code, 'native said no'));

            const reply = await read({ uri: `${pickDir}/IMG_0001.jpg` });

            expect(reply).toEqual({
                type: 'OnReadAttachment',
                success: false,
                error: { code, message: 'native said no' },
            });
        });

        it.each(['NOT_FOUND', undefined])('reports a native %s as INTERNAL', async code => {
            picker.readAttachment.mockRejectedValueOnce(rejection(code));

            const reply = await read({ uri: `${pickDir}/IMG_0001.jpg` });

            expect(reply.error?.code).toBe('INTERNAL');
        });
    });
});

describe('createAttachmentPickerHandlers — ReadVideoFrame', () => {
    let picker: jest.Mocked<IAttachmentPickerBridge>;
    let logger: jest.Mocked<ILogService>;
    const url = 'https://bucket.example/v.mp4?X-Amz-Signature=secret';

    beforeEach(() => {
        picker = createPickerMock();
        logger = createLoggerMock();
    });

    const read = (data: unknown) =>
        createAttachmentPickerHandlers(picker, logger).handleReadVideoFrame(message('ReadVideoFrame', data));

    it('passes the address, time and edge to native and answers with the frame', async () => {
        const reply = await read({ url, atMs: 500, maxEdge: 400 });

        expect(picker.readVideoFrame).toHaveBeenCalledWith(url, 500, 400);
        expect(reply).toEqual({ type: 'OnReadVideoFrame', success: true, data: frame });
    });

    it('takes the first frame at zero', async () => {
        await read({ url, atMs: 0, maxEdge: 400 });

        expect(picker.readVideoFrame).toHaveBeenCalledWith(url, 0, 400);
    });

    // Native reads whatever it is given; a local address would make it a reader of the app's files.
    it.each([
        ['file:///data/user/0/app/files/secret.mp4', 500, 400],
        ['http://bucket.example/v.mp4', 500, 400],
        [undefined, 500, 400],
        [url, -1, 400],
        [url, Number.NaN, 400],
        [url, 500, 0],
        [url, 500, undefined],
    ])('refuses %p, %p, %p as INVALID without asking native', async (u, atMs, maxEdge) => {
        const reply = await read({ url: u, atMs, maxEdge });

        expect(picker.readVideoFrame).not.toHaveBeenCalled();
        expect(reply).toMatchObject({ type: 'OnReadVideoFrame', success: false, error: { code: 'INVALID' } });
    });

    it.each(['INVALID', 'UNREADABLE'])('keeps native’s %s', async code => {
        picker.readVideoFrame.mockRejectedValueOnce(rejection(code));

        await expect(read({ url, atMs: 500, maxEdge: 400 })).resolves.toMatchObject({ error: { code } });
    });

    it.each(['NOT_FOUND', 'INTERNAL', undefined])('reports %s from native as UNREADABLE', async code => {
        picker.readVideoFrame.mockRejectedValueOnce(rejection(code));

        await expect(read({ url, atMs: 500, maxEdge: 400 })).resolves.toMatchObject({ error: { code: 'UNREADABLE' } });
    });

    it('logs the code and never the signed address', async () => {
        picker.readVideoFrame.mockRejectedValueOnce(rejection('UNREADABLE', `403 for ${url}`));

        await read({ url, atMs: 500, maxEdge: 400 });

        expect(logger.warn).toHaveBeenCalledWith('DEVICE', 'ReadVideoFrame failed: UNREADABLE');
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret');
    });
});
