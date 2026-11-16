import { describe, expect, it } from 'vitest';

import { EMPTY_PREVIEW_SOURCE, toCardSource } from './SourceFields';

describe('toCardSource', () => {
    // The server leaves a blank slot out, and sends no source$ at all when every slot is blank.
    it('is no source$ when every field is blank', () => {
        expect(toCardSource(EMPTY_PREVIEW_SOURCE)).toBeUndefined();
        expect(toCardSource({ key: ' ', color: '', url: '\t' })).toBeUndefined();
    });

    it('leaves out the blank fields', () => {
        expect(toCardSource({ key: 'attendance', color: '', url: '' })).toEqual({ key: 'attendance' });
    });

    // Reading the values is the renderer's job, as it is for a real message.
    it('passes the typed values through untouched', () => {
        expect(toCardSource({ key: ' ci-deploy ', color: 'Danger', url: 'javascript:alert(1)' })).toEqual({
            key: ' ci-deploy ',
            color: 'Danger',
            url: 'javascript:alert(1)',
        });
    });
});
