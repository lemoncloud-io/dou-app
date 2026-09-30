import { CHAT_IMAGE_MAX_BYTES, chatAttachmentSummary, chatImageCount, judgeChatImages } from './chatImages';

const file = (name: string, type = 'image/jpeg', size = 1024, lastModified = 1): File => {
    const f = new File(['x'], name, { type, lastModified });
    Object.defineProperty(f, 'size', { value: size });
    return f;
};

describe('judgeChatImages', () => {
    it('accepts the four server formats in pick order', () => {
        const picked = [
            file('a.png', 'image/png'),
            file('b.jpg'),
            file('c.gif', 'image/gif'),
            file('d.webp', 'image/webp'),
        ];

        const { accepted, rejected } = judgeChatImages(picked, 10);

        expect(accepted.map(f => f.name)).toEqual(['a.png', 'b.jpg', 'c.gif', 'd.webp']);
        expect(rejected).toEqual([]);
    });

    it('refuses other and untyped files as unsupported', () => {
        const { accepted, rejected } = judgeChatImages(
            [file('a.heic', 'image/heic'), file('b', ''), file('c.pdf', 'application/pdf')],
            10
        );

        expect(accepted).toEqual([]);
        expect(rejected.map(r => r.reason)).toEqual(['unsupported', 'unsupported', 'unsupported']);
    });

    it('refuses a file over the page ceiling, and takes one exactly at it', () => {
        const { accepted, rejected } = judgeChatImages(
            [
                file('big.jpg', 'image/jpeg', CHAT_IMAGE_MAX_BYTES + 1),
                file('edge.jpg', 'image/jpeg', CHAT_IMAGE_MAX_BYTES),
            ],
            10
        );

        expect(rejected).toEqual([{ file: expect.objectContaining({ name: 'big.jpg' }), reason: 'too-large' }]);
        expect(accepted.map(f => f.name)).toEqual(['edge.jpg']);
    });

    it('drops the same photo picked twice', () => {
        const { accepted, rejected } = judgeChatImages(
            [file('a.jpg'), file('a.jpg'), file('a.jpg', 'image/jpeg', 1024, 2)],
            10
        );

        expect(accepted).toHaveLength(2);
        expect(rejected.map(r => r.reason)).toEqual(['duplicate']);
    });

    it('cuts at the limit and says so for every file past it', () => {
        const picked = Array.from({ length: 12 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg', 1024, i));

        const { accepted, rejected } = judgeChatImages(picked, 10);

        expect(accepted).toHaveLength(10);
        expect(rejected.map(r => r.reason)).toEqual(['limit', 'limit']);
        expect(rejected[0].file.name).toBe('p10.jpg');
    });

    // A file's own properties are judged before its place in the pick, so a HEIC past the limit is
    // reported as the format problem it is, not as one too many.
    it('judges the file itself before its place in the pick', () => {
        const picked = [file('a.jpg', 'image/jpeg', 1, 1), file('b.heic', 'image/heic', 1, 2)];

        expect(judgeChatImages(picked, 1).rejected.map(r => r.reason)).toEqual(['unsupported']);
    });
});

describe('chatImageCount', () => {
    it('counts upload$$ first, then uploadIds, then nothing', () => {
        expect(chatImageCount({ upload$$: [{}, {}] as never, uploadIds: ['a'] })).toBe(2);
        expect(chatImageCount({ uploadIds: ['a', 'b', 'c'] })).toBe(3);
        expect(chatImageCount({})).toBe(0);
        expect(chatImageCount(null)).toBe(0);
    });
});

describe('chatAttachmentSummary', () => {
    const slots = (...stereos: (string | undefined)[]) =>
        stereos.map(stereo => (stereo ? { id: 'u', stereo } : { id: 'u' })) as never;

    it('names a single kind with its count', () => {
        expect(chatAttachmentSummary({ upload$$: slots('image') })).toEqual({ kind: 'image', count: 1 });
        expect(chatAttachmentSummary({ upload$$: slots('video', 'video') })).toEqual({ kind: 'video', count: 2 });
        expect(chatAttachmentSummary({ upload$$: slots('file', 'file', 'file') })).toEqual({ kind: 'file', count: 3 });
    });

    it('names a file, and calls a lone audio mixed', () => {
        expect(chatAttachmentSummary({ upload$$: slots('file') })).toEqual({ kind: 'file', count: 1 });
        expect(chatAttachmentSummary({ upload$$: slots('audio') })).toEqual({ kind: 'mixed', count: 1 });
    });

    // Its kind is only in the type the slot kept; read as an image, a PDF being sent was a "Photo".
    it('names a video or document still being sent by the type its slot kept', () => {
        const sending = [
            {
                localStatus: 'sending',
                localThumbUrl: 'blob:x',
                localName: 'a.pdf',
                localContentType: 'application/pdf',
            },
        ] as never;
        expect(chatAttachmentSummary({ upload$$: sending })).toEqual({ kind: 'file', count: 1 });
    });

    it('calls kinds that differ mixed', () => {
        expect(chatAttachmentSummary({ upload$$: slots('image', 'video') })).toEqual({ kind: 'mixed', count: 2 });
    });

    // A slot still being sent carries no stereo; reading it as anything but an image would flip a
    // photo on its way into "attachments" for the moment it is sending.
    it('takes a slot without stereo for an image', () => {
        const sending = [{ localStatus: 'sending', localThumbUrl: 'blob:x' }] as never;
        expect(chatAttachmentSummary({ upload$$: sending })).toEqual({ kind: 'image', count: 1 });
        expect(chatAttachmentSummary({ upload$$: slots(undefined, 'image') })).toEqual({ kind: 'image', count: 2 });
        expect(chatAttachmentSummary({ uploadIds: ['a', 'b'] })).toEqual({ kind: 'image', count: 2 });
    });

    it('counts the way chatImageCount does, and is null with nothing attached', () => {
        expect(chatAttachmentSummary({ upload$$: [], uploadIds: ['a'] })).toBeNull();
        expect(chatAttachmentSummary({})).toBeNull();
        expect(chatAttachmentSummary(null)).toBeNull();
    });
});
