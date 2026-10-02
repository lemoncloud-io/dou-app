import { attachmentPicker } from './attachmentPicker';

let mockNative = true;
const mockRequest = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => mockNative,
    webClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));
jest.mock('./appBridge', () => ({ appBridge: {} }));

const notFound = Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });
const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    attachmentPicker.reset();
});

describe('attachmentPicker.pick', () => {
    it('asks nothing in a browser', async () => {
        mockNative = false;

        await expect(attachmentPicker.pick({ source: 'media', selectionLimit: 10 })).resolves.toBeNull();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('asks the shell with what is left of the message and the server limits, waiting for the picker', async () => {
        mockRequest.mockResolvedValue({ data: { items: [], refused: [] } });

        await attachmentPicker.pick({ source: 'document', selectionLimit: 3 });

        expect(mockRequest).toHaveBeenCalledWith(
            {
                type: 'PickAttachments',
                data: {
                    source: 'document',
                    selectionLimit: 3,
                    maxBytes: { image: 20 * 1024 * 1024, video: 300 * 1024 * 1024, file: 50 * 1024 * 1024 },
                },
            },
            { timeoutMs: 30 * 60_000 }
        );
    });

    it('reads a photo into a page file and keeps a video or document as a shell file, in pick order', async () => {
        mockRequest.mockResolvedValueOnce({
            data: {
                items: [
                    {
                        kind: 'video',
                        uri: 'file:///c/attach-pick/a/IMG.MOV',
                        name: 'IMG.MOV',
                        contentType: 'video/quicktime',
                        size: 9,
                        needsExport: true,
                    },
                    {
                        kind: 'image',
                        uri: 'file:///c/attach-pick/p/p.jpg',
                        name: 'p.jpg',
                        contentType: 'image/jpeg',
                        size: 3,
                        width: 4,
                        height: 3,
                    },
                    {
                        kind: 'file',
                        uri: 'file:///c/attach-pick/b/a.hwp',
                        name: 'a.hwp',
                        contentType: 'application/octet-stream',
                        size: 5,
                    },
                ],
                refused: [{ name: 'big.pdf', kind: 'file', reason: 'too-large' }],
            },
        });
        mockRequest.mockResolvedValueOnce({
            data: { base64: btoa('jpg'), mimeType: 'image/jpeg', fileName: 'p.jpg', width: 4, height: 3 },
        });

        const pick = await attachmentPicker.pick({ source: 'media', selectionLimit: 10 });

        expect(mockRequest).toHaveBeenLastCalledWith(
            { type: 'ReadAttachment', data: { uri: 'file:///c/attach-pick/p/p.jpg' } },
            { timeoutMs: 2 * 60_000 }
        );

        expect(pick?.items[0]).toEqual({
            uri: 'file:///c/attach-pick/a/IMG.MOV',
            name: 'IMG.MOV',
            type: 'video/quicktime',
            size: 9,
            kind: 'video',
            needsExport: true,
        });
        expect(pick?.items[1]).toBeInstanceOf(File);
        expect(pick?.items[1]).toMatchObject({ name: 'p.jpg', type: 'image/jpeg', size: 3 });
        expect(pick?.items[2]).toEqual({
            uri: 'file:///c/attach-pick/b/a.hwp',
            name: 'a.hwp',
            type: 'application/octet-stream',
            size: 5,
            kind: 'file',
        });
        expect(pick?.refused).toEqual([{ name: 'big.pdf', kind: 'file', reason: 'too-large' }]);
    });

    it('reads the photos one after another and refuses one it cannot read alone', async () => {
        const photo = (name: string) => ({
            kind: 'image',
            uri: `file:///c/attach-pick/${name}/${name}.jpg`,
            name: `${name}.jpg`,
            contentType: 'image/jpeg',
            size: 1,
            width: 1,
            height: 1,
        });
        mockRequest.mockResolvedValueOnce({ data: { items: [photo('a'), photo('b'), photo('c')], refused: [] } });
        let reading = 0;
        let overlapped = false;
        mockRequest.mockImplementation(async ({ data }: { data: { uri: string } }) => {
            reading += 1;
            if (reading > 1) overlapped = true;
            await Promise.resolve();
            reading -= 1;
            if (data.uri.includes('/b/')) throw Object.assign(new Error('gone'), { code: 'SOURCE' });
            return { data: { base64: btoa('x'), mimeType: 'image/jpeg', fileName: 'x.jpg', width: 1, height: 1 } };
        });

        const pick = await attachmentPicker.pick({ source: 'media', selectionLimit: 10 });

        expect(overlapped).toBe(false);
        expect(pick?.items).toHaveLength(2);
        expect(pick?.refused).toEqual([{ name: 'b.jpg', kind: 'image', reason: 'unreadable' }]);
    });

    it('learns from NOT_FOUND for the page, and only from NOT_FOUND', async () => {
        mockRequest.mockRejectedValueOnce(timeout);
        await expect(attachmentPicker.pick({ source: 'media', selectionLimit: 10 })).rejects.toBe(timeout);
        expect(attachmentPicker.isUnsupported()).toBe(false);

        mockRequest.mockRejectedValueOnce(notFound);
        await expect(attachmentPicker.pick({ source: 'media', selectionLimit: 10 })).resolves.toBeNull();
        await expect(attachmentPicker.pick({ source: 'document', selectionLimit: 10 })).resolves.toBeNull();
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });
});

describe('attachmentPicker.prepareVideo', () => {
    const video = {
        uri: 'file:///c/attach-pick/a/IMG.MOV',
        name: 'IMG.MOV',
        type: 'video/quicktime',
        size: 9,
        kind: 'video' as const,
    };

    it('gives the converted file and its poster as shell files of the video slot, with a preview copy', async () => {
        mockRequest.mockResolvedValue({
            data: {
                file: {
                    uri: 'file:///c/attach-pick/a/IMG.mp4',
                    name: 'IMG.mp4',
                    contentType: 'video/mp4',
                    size: 8,
                    width: 1920,
                    height: 1080,
                },
                poster: {
                    uri: 'file:///c/attach-pick/a/poster.jpg',
                    base64: btoa('jpeg'),
                    contentType: 'image/jpeg',
                    size: 4,
                    width: 400,
                    height: 225,
                },
            },
        });

        const prepared = await attachmentPicker.prepareVideo(video);

        expect(mockRequest).toHaveBeenCalledWith(
            { type: 'PrepareVideo', data: { uri: video.uri } },
            { timeoutMs: 10 * 60_000 }
        );
        expect(prepared.file).toEqual({
            uri: 'file:///c/attach-pick/a/IMG.mp4',
            name: 'IMG.mp4',
            type: 'video/mp4',
            size: 8,
            kind: 'video',
        });
        expect(prepared).toMatchObject({ width: 1920, height: 1080 });
        expect(prepared.poster?.file).toEqual({
            uri: 'file:///c/attach-pick/a/poster.jpg',
            name: 'poster.jpg',
            type: 'image/jpeg',
            size: 4,
            kind: 'video',
        });
        expect(prepared.poster?.preview.size).toBe(4);
        expect(prepared.poster?.preview.type).toBe('image/jpeg');
    });

    it('passes a video without a poster through, and a refusal as the shell coded it', async () => {
        mockRequest.mockResolvedValueOnce({
            data: {
                file: { uri: 'u', name: 'a.mp4', contentType: 'video/mp4', size: 1, width: 0, height: 0 },
                poster: null,
            },
        });
        await expect(attachmentPicker.prepareVideo(video)).resolves.toMatchObject({ poster: null });

        const tooLarge = Object.assign(new Error('x'), { code: 'TOO_LARGE' });
        mockRequest.mockRejectedValueOnce(tooLarge);
        await expect(attachmentPicker.prepareVideo(video)).rejects.toBe(tooLarge);
    });
});
