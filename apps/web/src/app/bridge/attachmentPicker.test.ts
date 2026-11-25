import { attachmentPicker } from './attachmentPicker';

let mockNative = true;
const mockPick = jest.fn();
const mockRead = jest.fn();
const mockPrepare = jest.fn();
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get media() {
            return mockNative
                ? {
                      ...testing.browserMedia(),
                      kind: 'shell',
                      picker: {
                          pick: (...args: unknown[]) => mockPick(...args),
                          read: (...args: unknown[]) => mockRead(...args),
                      },
                      videoConverter: { prepare: (...args: unknown[]) => mockPrepare(...args) },
                  }
                : testing.browserMedia();
        },
    });
});

const timeout = Object.assign(new Error('slow'), { code: 'TIMEOUT' });

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
});

describe('attachmentPicker.pick', () => {
    it('asks nothing where the host has no picker', async () => {
        mockNative = false;

        await expect(attachmentPicker.pick({ source: 'media', selectionLimit: 10 })).resolves.toBeNull();
        expect(attachmentPicker.isUnsupported()).toBe(true);
        expect(mockPick).not.toHaveBeenCalled();
    });

    it('asks the shell with what is left of the message and the server limits', async () => {
        mockPick.mockResolvedValue({ items: [], refused: [] });

        await attachmentPicker.pick({ source: 'document', selectionLimit: 3 });

        expect(mockPick).toHaveBeenCalledWith({
            source: 'document',
            selectionLimit: 3,
            maxBytes: { image: 20 * 1024 * 1024, video: 300 * 1024 * 1024, file: 50 * 1024 * 1024 },
        });
    });

    it('reads a photo into a page file and keeps a video or document as a shell file, in pick order', async () => {
        mockPick.mockResolvedValueOnce({
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
        });
        mockRead.mockResolvedValueOnce({
            base64: btoa('jpg'),
            mimeType: 'image/jpeg',
            fileName: 'p.jpg',
            width: 4,
            height: 3,
        });

        const pick = await attachmentPicker.pick({ source: 'media', selectionLimit: 10 });

        expect(mockRead).toHaveBeenCalledTimes(1);
        expect(mockRead).toHaveBeenCalledWith('file:///c/attach-pick/p/p.jpg');

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
        mockPick.mockResolvedValueOnce({ items: [photo('a'), photo('b'), photo('c')], refused: [] });
        let reading = 0;
        let overlapped = false;
        mockRead.mockImplementation(async (uri: string) => {
            reading += 1;
            if (reading > 1) overlapped = true;
            await Promise.resolve();
            reading -= 1;
            if (uri.includes('/b/')) throw Object.assign(new Error('gone'), { code: 'SOURCE' });
            return { base64: btoa('x'), mimeType: 'image/jpeg', fileName: 'x.jpg', width: 1, height: 1 };
        });

        const pick = await attachmentPicker.pick({ source: 'media', selectionLimit: 10 });

        expect(overlapped).toBe(false);
        expect(pick?.items).toHaveLength(2);
        expect(pick?.refused).toEqual([{ name: 'b.jpg', kind: 'image', reason: 'unreadable' }]);
    });

    it('keeps a photo picked as a document in the shell, read at the send rather than at the pick', async () => {
        mockPick.mockResolvedValueOnce({
            items: [
                {
                    kind: 'file',
                    uri: 'file:///c/attach-pick/a/shot.png',
                    name: 'shot.png',
                    contentType: 'image/png',
                    size: 3,
                },
                {
                    kind: 'file',
                    uri: 'file:///c/attach-pick/b/clip.mp4',
                    name: 'clip.mp4',
                    contentType: 'video/mp4',
                    size: 7,
                },
            ],
            refused: [{ name: 'big.pdf', kind: 'file', reason: 'too-large' }],
        });

        const pick = await attachmentPicker.pick({ source: 'document', selectionLimit: 10 });

        expect(mockPick).toHaveBeenCalledTimes(1);
        expect(mockRead).not.toHaveBeenCalled();
        expect(pick?.items).toEqual([
            { uri: 'file:///c/attach-pick/a/shot.png', name: 'shot.png', type: 'image/png', size: 3, kind: 'file' },
            { uri: 'file:///c/attach-pick/b/clip.mp4', name: 'clip.mp4', type: 'video/mp4', size: 7, kind: 'file' },
        ]);
        expect(pick?.refused).toEqual([{ name: 'big.pdf', kind: 'file', reason: 'too-large' }]);
    });

    it('reads a photo the album answered as a file at the pick, as an album pick goes out at once', async () => {
        mockPick.mockResolvedValueOnce({
            items: [
                {
                    kind: 'file',
                    uri: 'file:///c/attach-pick/a/p.png',
                    name: 'p.png',
                    contentType: 'image/png',
                    size: 3,
                },
            ],
            refused: [],
        });
        mockRead.mockResolvedValueOnce({
            base64: btoa('png'),
            mimeType: 'image/png',
            fileName: 'p.png',
            width: 1,
            height: 1,
        });

        const pick = await attachmentPicker.pick({ source: 'media', selectionLimit: 10 });

        expect(mockRead).toHaveBeenCalledTimes(1);
        expect(pick?.items[0]).toBeInstanceOf(File);
    });

    it('passes a failure through without giving up on the picker', async () => {
        mockPick.mockRejectedValueOnce(timeout);
        await expect(attachmentPicker.pick({ source: 'media', selectionLimit: 10 })).rejects.toBe(timeout);
        expect(attachmentPicker.isUnsupported()).toBe(false);
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
        mockPrepare.mockResolvedValue({
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
        });

        const prepared = await attachmentPicker.prepareVideo(video);

        expect(mockPrepare).toHaveBeenCalledWith(video.uri);
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
        mockPrepare.mockResolvedValueOnce({
            file: { uri: 'u', name: 'a.mp4', contentType: 'video/mp4', size: 1, width: 0, height: 0 },
            poster: null,
        });
        await expect(attachmentPicker.prepareVideo(video)).resolves.toMatchObject({ poster: null });

        const tooLarge = Object.assign(new Error('x'), { code: 'TOO_LARGE' });
        mockPrepare.mockRejectedValueOnce(tooLarge);
        await expect(attachmentPicker.prepareVideo(video)).rejects.toBe(tooLarge);
    });

    it('rejects where the host has no video conversion', async () => {
        mockNative = false;

        await expect(attachmentPicker.prepareVideo(video)).rejects.toThrow();
        expect(mockPrepare).not.toHaveBeenCalled();
    });
});

describe('attachmentPicker.readPhotos', () => {
    const shellPhoto = {
        uri: 'file:///c/attach-pick/a/shot.png',
        name: 'shot.png',
        type: 'image/png',
        size: 3,
        kind: 'file' as const,
    };
    const shellDoc = {
        uri: 'file:///c/attach-pick/b/plan.pdf',
        name: 'plan.pdf',
        type: 'application/pdf',
        size: 5,
        kind: 'file' as const,
    };
    const shellVideo = {
        uri: 'file:///c/attach-pick/c/clip.mp4',
        name: 'clip.mp4',
        type: 'video/mp4',
        size: 7,
        kind: 'file' as const,
    };

    it('reads a shell photo into a page file in place, and leaves documents, videos and page files as they were', async () => {
        const pageFile = new File(['x'], 'a.pdf', { type: 'application/pdf' });
        mockRead.mockResolvedValueOnce({
            base64: btoa('png'),
            mimeType: 'image/png',
            fileName: 'shot.png',
            width: 4,
            height: 3,
        });

        const read = await attachmentPicker.readPhotos([shellDoc, shellPhoto, pageFile, shellVideo]);

        expect(mockRead).toHaveBeenCalledTimes(1);
        expect(mockRead).toHaveBeenCalledWith(shellPhoto.uri);
        expect(read.items[0]).toBe(shellDoc);
        expect(read.items[1]).toBeInstanceOf(File);
        expect(read.items[1]).toMatchObject({ name: 'shot.png', type: 'image/png', size: 3 });
        expect(read.items[2]).toBe(pageFile);
        expect(read.items[3]).toBe(shellVideo);
        expect(read.refused).toEqual([]);
    });

    it('asks the shell nothing when nothing is a shell photo', async () => {
        const read = await attachmentPicker.readPhotos([shellDoc, new File(['x'], 'p.jpg', { type: 'image/jpeg' })]);

        expect(mockRead).not.toHaveBeenCalled();
        expect(read.items).toHaveLength(2);
    });

    it("takes the pick's photo type when the shell can only name the read file generically", async () => {
        mockRead.mockResolvedValueOnce({
            base64: btoa('jpg'),
            mimeType: 'application/octet-stream',
            fileName: 'scan',
            width: 1,
            height: 1,
        });

        const read = await attachmentPicker.readPhotos([{ ...shellPhoto, name: 'scan', type: 'image/jpeg' }]);

        expect(read.items[0]).toMatchObject({ name: 'scan', type: 'image/jpeg' });
    });

    it('refuses a shell photo it cannot read as an unreadable image, and keeps the rest', async () => {
        mockRead.mockRejectedValueOnce(Object.assign(new Error('not a picked photo'), { code: 'INTERNAL' }));

        const read = await attachmentPicker.readPhotos([
            { ...shellPhoto, name: 'old.gif', type: 'image/gif' },
            shellDoc,
        ]);

        expect(read.items).toEqual([shellDoc]);
        expect(read.refused).toEqual([{ name: 'old.gif', kind: 'image', reason: 'unreadable' }]);
    });

    it('refuses a shell photo as unreadable where the host has no picker to read it', async () => {
        mockNative = false;

        const read = await attachmentPicker.readPhotos([shellPhoto]);

        expect(mockRead).not.toHaveBeenCalled();
        expect(read).toEqual({ items: [], refused: [{ name: 'shot.png', kind: 'image', reason: 'unreadable' }] });
    });
});
