import { describe, expect, it } from 'vitest';

import { EMPTY_PREVIEW_SOURCE, toCardSource } from './SourceFields';

describe('toCardSource', () => {
    it('is no source$ when every field is blank', () => {
        expect(toCardSource(EMPTY_PREVIEW_SOURCE)).toBeUndefined();
        expect(toCardSource({ key: ' ', color: '', url: '\t' })).toBeUndefined();
    });

    it('leaves out the blank fields', () => {
        expect(toCardSource({ key: 'attendance', color: '', url: '' })).toEqual({ key: 'attendance' });
    });

    it('passes the typed values through untouched', () => {
        expect(toCardSource({ key: ' ci-deploy ', color: 'Danger', url: 'javascript:alert(1)' })).toEqual({
            key: ' ci-deploy ',
            color: 'Danger',
            url: 'javascript:alert(1)',
        });
    });
});
