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

    it('is empty when there is neither', () => {
        expect(messagePreview({ content: '' })).toBe('');
    });
});
