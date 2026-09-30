import { CHAT_ATTACHMENT_MAX_BYTES, chatAttachmentFormat } from './chatAttachments';

const MiB = 1024 * 1024;

describe('chatAttachmentFormat', () => {
    it('takes the twelve server formats by their type', () => {
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
    });

    it('refuses a video or document whose extension says another format', () => {
        expect(chatAttachmentFormat({ name: 'a.docx', type: 'application/pdf' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'clip.pdf', type: 'video/mp4' })).toBeNull();
    });

    // The server does not check an image's name, and renaming one would only confuse the sender.
    it('leaves an image name alone', () => {
        expect(chatAttachmentFormat({ name: 'photo', type: 'image/jpeg' })?.name).toBe('photo');
        expect(chatAttachmentFormat({ name: 'photo.jpeg', type: 'image/png' })?.name).toBe('photo.jpeg');
    });

    it('refuses what the server does not take', () => {
        expect(chatAttachmentFormat({ name: 'a.heic', type: 'image/heic' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'a.zip', type: 'application/zip' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'a.mov', type: 'video/quicktime' })).toBeNull();
        expect(chatAttachmentFormat({ name: 'noext', type: '' })).toBeNull();
    });
});

describe('CHAT_ATTACHMENT_MAX_BYTES', () => {
    it('caps each kind the way the server does', () => {
        expect(CHAT_ATTACHMENT_MAX_BYTES).toEqual({ image: 20 * MiB, video: 300 * MiB, file: 50 * MiB });
    });
});
