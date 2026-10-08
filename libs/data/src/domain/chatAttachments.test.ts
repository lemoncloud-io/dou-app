import {
    CHAT_ATTACHMENT_ACCEPT,
    chatAttachmentAccept,
    CHAT_ATTACHMENT_MAX_BYTES,
    chatAttachmentExtension,
    chatAttachmentFormat,
    CHAT_ATTACHMENT_MAX_NAME_BYTES,
    CHAT_ATTACHMENT_ZIP_TYPE,
    isChatAttachmentNameTooLong,
} from './chatAttachments';

const MiB = 1024 * 1024;

describe('chatAttachmentFormat', () => {
    it('takes the thirteen server formats by their type', () => {
        expect(chatAttachmentFormat({ name: 'a.png', type: 'image/png' })).toEqual({
            type: 'image/png',
            kind: 'image',
            name: 'a.png',
        });
        expect(chatAttachmentFormat({ name: 'clip.mp4', type: 'video/mp4' })?.kind).toBe('video');
        for (const [name, type] of [
            ['a.pdf', 'application/pdf'],
            ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            ['a.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
            ['a.hwp', 'application/x-hwp'],
            ['a.hwpx', 'application/hwp+zip'],
            ['a.txt', 'text/plain'],
            ['a.zip', 'application/zip'],
        ]) {
            expect(chatAttachmentFormat({ name, type })).toEqual({ type, kind: 'file', name });
        }
    });

    // Most systems do not know HWP, and the browser hands such a file over with an empty type.
    it('reads an empty or generic type from the extension, in any case', () => {
        expect(chatAttachmentFormat({ name: '보고서.HWP', type: '' })).toEqual({
            type: 'application/x-hwp',
            kind: 'file',
            name: '보고서.HWP',
        });
        expect(chatAttachmentFormat({ name: 'a.hwpx', type: 'application/octet-stream' })?.type).toBe(
            'application/hwp+zip'
        );
        expect(chatAttachmentFormat({ name: 'logs.ZIP', type: '' })?.type).toBe('application/zip');
        // An Android pick the system could not type arrives under the generic one.
        expect(chatAttachmentFormat({ name: 'a.zip', type: 'application/octet-stream' })?.type).toBe('application/zip');
    });

    // Chromium on Windows types a `.zip` by the registry's name for it, not the registered one.
    it('maps the names a ZIP archive is sometimes typed with', () => {
        for (const type of ['application/x-zip-compressed', 'application/x-zip']) {
            expect(chatAttachmentFormat({ name: 'logs.zip', type })).toEqual({
                type: 'application/zip',
                kind: 'file',
                name: 'logs.zip',
            });
        }
    });

    // DOCX, XLSX, PPTX and HWPX are ZIP containers, and a system without their apps may say only that.
    it('does not send an office file typed as a ZIP archive as an archive', () => {
        expect(chatAttachmentFormat({ name: 'a.docx', type: 'application/x-zip-compressed' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'a.hwpx', type: 'application/zip' })).toBeNull();
    });

    it('maps the names Hancom files are sometimes typed with', () => {
        expect(chatAttachmentFormat({ name: 'a.hwp', type: 'application/haansofthwp' })?.type).toBe(
            'application/x-hwp'
        );
        expect(chatAttachmentFormat({ name: 'a.hwpx', type: 'application/vnd.hancom.hwpx' })?.type).toBe(
            'application/hwp+zip'
        );
    });

    // The server refuses a video or document whose name does not end in its format's extension.
    it('adds the extension to a video or document that has none', () => {
        expect(chatAttachmentFormat({ name: 'report', type: 'application/pdf' })?.name).toBe('report.pdf');
        expect(chatAttachmentFormat({ name: 'minutes v1.2', type: 'text/plain' })?.name).toBe('minutes v1.2.txt');
        expect(chatAttachmentFormat({ name: '.pdf', type: 'application/pdf' })?.name).toBe('.pdf.pdf');
        // A tail that is no format's extension would otherwise be saved as, say, a script.
        expect(chatAttachmentFormat({ name: 'run.js', type: 'text/plain' })?.name).toBe('run.js.txt');
        expect(chatAttachmentFormat({ name: 'logs', type: 'application/zip' })?.name).toBe('logs.zip');
    });

    it('refuses a video or document whose extension says another format', () => {
        expect(chatAttachmentFormat({ name: 'a.docx', type: 'application/pdf' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'clip.pdf', type: 'video/mp4' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'x.pdf', type: 'application/zip' })).toBeNull();
    });

    // The server does not check an image's name, and renaming one would only confuse the sender.
    it('leaves an image name alone', () => {
        expect(chatAttachmentFormat({ name: 'photo', type: 'image/jpeg' })?.name).toBe('photo');
        expect(chatAttachmentFormat({ name: 'photo.jpeg', type: 'image/png' })?.name).toBe('photo.jpeg');
    });

    // Only a type that says nothing is read from the name; a real type the server refuses stays refused.
    it('refuses a file typed as an unsupported format whatever its name says', () => {
        expect(chatAttachmentFormat({ name: 'x.png', type: 'image/heic' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'x.png', type: 'image/svg+xml' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'x.png', type: 'application/x-7z-compressed' })).toBeNull();
    });

    it('refuses what the server does not take', () => {
        expect(chatAttachmentFormat({ name: 'a.heic', type: 'image/heic' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'a.7z', type: 'application/x-7z-compressed' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'a.mov', type: 'video/quicktime' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'noext', type: '' })).toBeNull();
    });
});

describe('CHAT_ATTACHMENT_MAX_BYTES', () => {
    it('caps each kind the way the server does', () => {
        expect(CHAT_ATTACHMENT_MAX_BYTES).toEqual({ image: 20 * MiB, video: 300 * MiB, file: 50 * MiB });
    });
});

describe('isChatAttachmentNameTooLong', () => {
    it("measures the limit in UTF-8 bytes, the server's unit", () => {
        expect(CHAT_ATTACHMENT_MAX_NAME_BYTES).toBe(255);
    });

    it('allows exactly the limit and refuses one byte more', () => {
        expect(isChatAttachmentNameTooLong('a'.repeat(255))).toBe(false);
        expect(isChatAttachmentNameTooLong('a'.repeat(256))).toBe(true);
    });

    it('counts Hangul as three bytes and an emoji as four', () => {
        expect(isChatAttachmentNameTooLong('가'.repeat(85))).toBe(false);
        expect(isChatAttachmentNameTooLong('가'.repeat(86))).toBe(true);
        expect(isChatAttachmentNameTooLong('😀'.repeat(63) + 'abc')).toBe(false);
        expect(isChatAttachmentNameTooLong('😀'.repeat(64))).toBe(true);
    });

    // macOS hands over Hangul decomposed (three jamo per syllable); the server measures it composed.
    it('measures a decomposed name composed, as the server does', () => {
        const name = '가'.repeat(85).normalize('NFD');
        expect(new TextEncoder().encode(name).length).toBeGreaterThan(CHAT_ATTACHMENT_MAX_NAME_BYTES);
        expect(isChatAttachmentNameTooLong(name)).toBe(false);
    });
});

describe('CHAT_ATTACHMENT_ACCEPT', () => {
    // An OS picker filters by what `accept` names; HWP has no type it knows, so only `.hwp` lets it through.
    it('names every type and every extension, for a picker that knows only one of them', () => {
        const accept = CHAT_ATTACHMENT_ACCEPT.split(',');
        expect(accept).toEqual(
            expect.arrayContaining([
                'image/png',
                'video/mp4',
                'application/x-hwp',
                'application/zip',
                '.hwp',
                '.hwpx',
                '.jpeg',
                '.zip',
            ])
        );
        expect(accept).toHaveLength(13 + 14);
    });
});

describe('chatAttachmentExtension', () => {
    it('gives the extension a saved file of a type should carry', () => {
        expect(chatAttachmentExtension('application/pdf')).toBe('pdf');
        expect(chatAttachmentExtension('image/jpeg')).toBe('jpg');
        expect(chatAttachmentExtension('application/zip')).toBe('zip');
        expect(chatAttachmentExtension('application/x-7z-compressed')).toBeUndefined();
    });
});

describe('chatAttachmentAccept', () => {
    it('lists the types and extensions of the kinds asked for only', () => {
        const documents = chatAttachmentAccept(['file']).split(',');

        expect(documents).toEqual(
            expect.arrayContaining(['application/pdf', '.pdf', '.hwp', 'application/x-hwp', '.txt'])
        );
        expect(documents).not.toContain('video/mp4');
        expect(documents).not.toContain('image/png');
        expect(chatAttachmentAccept(['image', 'video']).split(',')).toEqual(
            expect.arrayContaining(['image/png', 'video/mp4', '.mp4', '.jpeg'])
        );
    });

    // An app that sends fewer formats than the server takes leaves them out of its picker.
    it('leaves out the formats the app does not send', () => {
        const accept = chatAttachmentAccept(['file'], format => format.type !== CHAT_ATTACHMENT_ZIP_TYPE).split(',');

        expect(accept).not.toContain('application/zip');
        expect(accept).not.toContain('.zip');
        expect(accept).toEqual(expect.arrayContaining(['application/pdf', '.hwpx']));
    });

    it('keeps the full list the same as asking for every kind', () => {
        expect(CHAT_ATTACHMENT_ACCEPT).toBe(chatAttachmentAccept(['image', 'video', 'file']));
    });
});
