import {
    MAX_ATTACHMENTS,
    MAX_ATTACHMENT_BYTES,
    attachmentKey,
    validateAttachments,
    type AttachmentCandidate,
} from './chatAttachments';

const file = (name: string, fields: Partial<AttachmentCandidate> = {}): AttachmentCandidate => ({
    name,
    size: 1024,
    lastModified: 1,
    type: 'image/png',
    ...fields,
});

describe('validateAttachments', () => {
    it('accepts supported images in order', () => {
        const { accepted, rejection } = validateAttachments([], [file('a.png'), file('b.png')]);

        expect(accepted.map(f => f.name)).toEqual(['a.png', 'b.png']);
        expect(rejection).toBeUndefined();
    });

    it('refuses an unsupported type', () => {
        const { accepted, rejection } = validateAttachments([], [file('a.heic', { type: 'image/heic' })]);

        expect(accepted).toEqual([]);
        expect(rejection).toBe('unsupported');
    });

    // The ceiling is a memory budget: the engine reads the file whole to send it.
    it('refuses a file over the size ceiling', () => {
        const { accepted, rejection } = validateAttachments([], [file('big.png', { size: MAX_ATTACHMENT_BYTES + 1 })]);

        expect(accepted).toEqual([]);
        expect(rejection).toBe('too-large');
    });

    it('accepts a file exactly at the ceiling', () => {
        const { accepted } = validateAttachments([], [file('edge.png', { size: MAX_ATTACHMENT_BYTES })]);

        expect(accepted.map(f => f.name)).toEqual(['edge.png']);
    });

    it('refuses a duplicate of what is already in the tray, and within one pick', () => {
        const existing = attachmentKey(file('a.png'));

        expect(validateAttachments([existing], [file('a.png')]).rejection).toBe('duplicate');
        expect(validateAttachments([], [file('a.png'), file('a.png')]).accepted).toHaveLength(1);
    });

    it('same name, different size is not a duplicate', () => {
        const existing = attachmentKey(file('a.png'));

        expect(validateAttachments([existing], [file('a.png', { size: 2048 })]).rejection).toBeUndefined();
    });

    it('keeps the first ten and reports the limit', () => {
        const incoming = Array.from({ length: 12 }, (_, i) => file(`${i}.png`, { lastModified: i }));

        const { accepted, rejection } = validateAttachments([], incoming);

        expect(accepted).toHaveLength(MAX_ATTACHMENTS);
        expect(accepted.map(f => f.name)).toEqual([
            '0.png',
            '1.png',
            '2.png',
            '3.png',
            '4.png',
            '5.png',
            '6.png',
            '7.png',
            '8.png',
            '9.png',
        ]);
        expect(rejection).toBe('limit');
    });

    // One notice per pick, and the file's own problem is the more useful sentence.
    it('reports the first refusal met, file properties before tray state', () => {
        const incoming = [file('a.png', { type: 'application/pdf', size: MAX_ATTACHMENT_BYTES + 1 })];

        expect(validateAttachments([], incoming).rejection).toBe('unsupported');
    });
});
