import { afterEach, describe, expect, it } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

import { useChatImagesStore } from '../stores';
import { useChatImages } from './useChatImages';

const SAMPLE = { id: 's1', name: 'sample.png', url: 'blob:sample' };

afterEach(() => useChatImagesStore.getState().clear());

describe('useChatImages', () => {
    it("reads a message's own uploads ahead of any debug sample", () => {
        useChatImagesStore.getState().setImages('row-1', [SAMPLE]);
        const message = {
            id: 'row-1',
            upload$$: [{ id: 'u1', status: 'stored', orgUrl: 'https://s/o1' }],
        } as Pick<DomainChat, 'id' | 'upload$$'>;

        const { result } = renderHook(() => useChatImages(message));

        expect(result.current.map(image => image.url)).toEqual(['https://s/o1']);
    });

    it('falls back to the debug samples for a message with no uploads', () => {
        useChatImagesStore.getState().setImages('row-1', [SAMPLE]);

        const { result } = renderHook(() => useChatImages({ id: 'row-1' }));

        expect(result.current).toEqual([SAMPLE]);
    });

    it('hands back the same empty list across renders, so a memoised row does not re-render for "still none"', () => {
        const message = { id: 'row-1' };
        const { result, rerender } = renderHook(() => useChatImages(message));
        const first = result.current;

        rerender();

        expect(result.current).toEqual([]);
        expect(result.current).toBe(first);
    });
});
