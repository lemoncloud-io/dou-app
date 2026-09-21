import {
    buildChatUploadsContent,
    chatContentText,
    chatUploadsContentType,
    parseChatUploads,
    parseChatUploadsContent,
    summarizeChatContent,
    toChatUploads,
    type ChatUpload,
} from './chatUploads';

const upload = (fields: Partial<ChatUpload> = {}): ChatUpload => ({
    id: '1000009',
    name: 'a.png',
    url: 'https://file.test/uploads/1000009',
    contentType: 'image/png',
    ...fields,
});

describe('parseChatUploadsContent', () => {
    it('reads a manifest', () => {
        const content = buildChatUploadsContent('hi', [upload()]);

        expect(parseChatUploadsContent(content)).toEqual({ text: 'hi', uploads: [upload()] });
    });

    it('plain text is not a manifest', () => {
        expect(parseChatUploadsContent('hello')).toBeNull();
        expect(parseChatUploadsContent('')).toBeNull();
        expect(parseChatUploadsContent(undefined)).toBeNull();
    });

    // A message that opens with a brace but is not JSON must render as what the user typed.
    it('broken JSON is not a manifest', () => {
        expect(parseChatUploadsContent('{ not json')).toBeNull();
    });

    // Block Kit puts its own JSON in `content`. The two readers are told apart by their key, and the
    // order in the app is blocks first, so this one must not claim a block message.
    it('a Block Kit message is not a manifest', () => {
        expect(parseChatUploadsContent('{"blocks":[{"type":"divider"}]}')).toBeNull();
    });

    // Recognized, but with nothing to draw. It must NOT read as "not a manifest": the surfaces that
    // get null print `content` verbatim, which would put this JSON on screen.
    it('an empty uploads array is still a manifest, and keeps its text', () => {
        expect(parseChatUploadsContent('{"text":"hi","uploads":[]}')).toEqual({ text: 'hi', uploads: [] });
    });

    it('drops entries without an id or url, keeps the rest', () => {
        const content = JSON.stringify({ text: '', uploads: [{ name: 'x' }, upload()] });

        expect(parseChatUploads(content)).toEqual([upload()]);
    });

    it('tolerates a missing name and unknown extra fields', () => {
        const content = JSON.stringify({ uploads: [{ id: '1', url: 'https://u/1', stereo: 'image' }] });

        expect(parseChatUploads(content)).toEqual([{ id: '1', name: '', url: 'https://u/1' }]);
    });
});

describe('chatContentText', () => {
    // The whole reason a recognized-but-empty manifest is not null.
    it('never hands back the manifest JSON', () => {
        expect(chatContentText('{"text":"hi","uploads":[]}')).toBe('hi');
        expect(chatContentText('{"uploads":[]}')).toBe('');
    });

    it('is the typed text for a manifest, the content itself otherwise', () => {
        expect(chatContentText(buildChatUploadsContent('caption', [upload()]))).toBe('caption');
        expect(chatContentText('plain')).toBe('plain');
    });
});

describe('chatUploadsContentType', () => {
    it('reports the shared MIME when the batch is uniform', () => {
        expect(chatUploadsContentType([upload(), upload({ id: '2' })])).toBe('image/png');
    });

    it('reports the generic marker when types differ or are missing', () => {
        expect(chatUploadsContentType([upload(), upload({ id: '2', contentType: 'image/jpeg' })])).toBe('uploads');
        expect(chatUploadsContentType([upload({ contentType: undefined })])).toBe('uploads');
    });
});

describe('summarizeChatContent', () => {
    // Every one-line surface reads `content`; without this they print the manifest.
    it('an attachment message folds to its text and a count', () => {
        const content = buildChatUploadsContent('보냅니다', [upload(), upload({ id: '2', name: 'b.png' })]);

        expect(summarizeChatContent(content)).toEqual({ text: '보냅니다', uploadCount: 2, firstName: 'a.png' });
    });

    it('an ordinary message is unchanged', () => {
        expect(summarizeChatContent('hello')).toEqual({ text: 'hello', uploadCount: 0 });
    });

    it('a caption-less attachment offers the first file name', () => {
        expect(summarizeChatContent(buildChatUploadsContent('', [upload()]))).toEqual({
            text: '',
            uploadCount: 1,
            firstName: 'a.png',
        });
    });
});

describe('parseChatUploads — what a message from someone else may not do', () => {
    // The manifest is another client's input and lands in an `<img src>`.
    it('drops an upload whose url is not http(s)', () => {
        const content = JSON.stringify({
            uploads: [
                { id: '1', name: 'x', url: 'javascript:alert(1)' },
                { id: '2', name: 'y', url: 'data:image/png;base64,AAAA' },
                { id: '3', name: 'z', url: '/uploads/3' },
                { id: '4', name: 'ok', url: 'https://file.test/uploads/4' },
            ],
        });

        expect(parseChatUploads(content)?.map(u => u.id)).toEqual(['4']);
    });

    // The cap counts what is kept, so refused entries must not consume it and hide the good ones.
    it('a run of refused entries does not eat the render cap', () => {
        const uploads = [
            ...Array.from({ length: 12 }, (_, i) => ({ id: `bad${i}`, url: 'javascript:alert(1)' })),
            { id: 'good', name: 'a.png', url: 'https://file.test/uploads/good' },
        ];

        expect(parseChatUploads(JSON.stringify({ uploads }))?.map(u => u.id)).toEqual(['good']);
    });

    // A list screen would build every tile it is handed.
    it('renders at most ten, however many are claimed', () => {
        const uploads = Array.from({ length: 50 }, (_, i) => ({
            id: `${i}`,
            name: `${i}.png`,
            url: `https://file.test/uploads/${i}`,
        }));

        expect(parseChatUploads(JSON.stringify({ uploads }))).toHaveLength(10);
    });

    it('ignores sizes that cannot be laid out', () => {
        const content = JSON.stringify({
            uploads: [{ id: '1', name: 'x', url: 'https://file.test/1', width: -5, height: 0, contentSize: NaN }],
        });

        expect(parseChatUploads(content)).toEqual([{ id: '1', name: 'x', url: 'https://file.test/1' }]);
    });

    // Refusing the url must not put the url on screen: the text survives, the gallery does not.
    it('a manifest whose every entry is refused keeps its text and draws nothing', () => {
        const content = JSON.stringify({ text: 'hi', uploads: [{ id: '1', url: 'javascript:alert(1)' }] });

        expect(parseChatUploadsContent(content)).toEqual({ text: 'hi', uploads: [] });
        expect(parseChatUploads(content)).toBeNull();
        expect(chatContentText(content)).toBe('hi');
        expect(summarizeChatContent(content)).toEqual({ text: 'hi', uploadCount: 0 });
    });
});

describe('toChatUploads', () => {
    it('keeps the stored slots in order and drops the rest', () => {
        const views = [
            { id: '1', status: 'stored', url: 'https://file.test/1', name: 'a.png', contentType: 'image/png' },
            { id: '2', status: 'failed', error: '413 TOO LARGE - nope' },
            { id: '3', status: 'stored', url: 'https://file.test/3', name: 'c.png' },
        ] as never;

        expect(toChatUploads(views).map(u => u.id)).toEqual(['1', '3']);
    });

    it('a slot with no url cannot be shown even when it claims to be stored', () => {
        const views = [{ id: '1', status: 'stored', name: 'a.png' }] as never;

        expect(toChatUploads(views)).toEqual([]);
    });
});
