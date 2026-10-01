import { describe, expect, it } from 'vitest';

// Initialises i18next, so the photo labels read as the reader sees them.
import '../../../i18n';

import { messagePreview } from './messagePreview';

describe('messagePreview', () => {
    it('is the message text when there is any', () => {
        expect(messagePreview({ content: '**hi** there', uploadIds: ['u1'] })).toBe('hi there');
    });

    // An image message has no text; its OS banner read "Raine:" with nothing after it.
    it('names a single photo', () => {
        expect(messagePreview({ content: '', uploadIds: ['u1'] })).toBe('Photo');
    });

    it('counts several, from upload$$ when the row carries it', () => {
        expect(messagePreview({ content: '', upload$$: [{}, {}, {}] as never })).toBe('3 photos');
    });

    it('names a video or a file, and several of either', () => {
        const slots = (stereo: string, n: number) => Array.from({ length: n }, () => ({ id: 'u', stereo })) as never;
        expect(messagePreview({ content: '', upload$$: slots('video', 1) })).toBe('Video');
        expect(messagePreview({ content: '', upload$$: slots('video', 2) })).toBe('2 videos');
        expect(messagePreview({ content: '', upload$$: slots('file', 1) })).toBe('File');
        expect(messagePreview({ content: '', upload$$: slots('file', 3) })).toBe('3 files');
    });

    it('counts kinds that differ as attachments', () => {
        const upload$$ = [
            { id: 'a', stereo: 'image' },
            { id: 'b', stereo: 'file' },
        ] as never;
        expect(messagePreview({ content: '', upload$$ })).toBe('2 attachments');
    });

    // `audio` has no noun of its own, so a single one is an attachment, not "1 attachments".
    it('names a single attachment of no named kind', () => {
        expect(messagePreview({ content: '', upload$$: [{ id: 'a', stereo: 'audio' }] as never })).toBe('Attachment');
    });

    it('is empty when there is neither', () => {
        expect(messagePreview({ content: '' })).toBe('');
    });
});
