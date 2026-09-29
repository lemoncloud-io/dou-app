import { describe, expect, it } from 'vitest';

import {
    MAX_ATTACHMENTS,
    attachmentKey,
    layoutImageGrid,
    toChatImages,
    validateAttachments,
    type ChatImage,
} from './chatImages';

const file = (name: string, type = 'image/png', size = 10) => ({ name, type, size, lastModified: 1 });
const image = (i: number): ChatImage => ({ id: `i${i}`, name: `${i}.png`, url: `blob:${i}` });

describe('validateAttachments', () => {
    it('accepts supported images in order', () => {
        const result = validateAttachments([], [file('a.png'), file('b.jpg', 'image/jpeg')]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png', 'b.jpg']);
        expect(result.rejection).toBeUndefined();
    });

    it('refuses a type the viewer cannot draw, keeping the rest', () => {
        const result = validateAttachments([], [file('doc.pdf', 'application/pdf'), file('a.png')]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
        expect(result.rejection).toBe('unsupported');
    });

    // A re-pick of a file already in the tray, and the same file twice in one drop.
    it('refuses duplicates against the tray and within the batch', () => {
        const a = file('a.png');
        expect(validateAttachments([attachmentKey(a)], [a]).rejection).toBe('duplicate');
        const batch = validateAttachments([], [a, a]);
        expect(batch.accepted).toHaveLength(1);
        expect(batch.rejection).toBe('duplicate');
    });

    it('keeps the first files up to the limit and flags the overflow', () => {
        const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => `k${i}`);
        const result = validateAttachments(existing, [file('a.png'), file('b.png')]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
        expect(result.rejection).toBe('limit');
    });

    // One dialog per drop: the first refusal met is the one reported.
    it('reports only the first refusal', () => {
        const result = validateAttachments([], [file('x.heic', 'image/heic'), file('a.png'), file('a.png')]);
        expect(result.rejection).toBe('unsupported');
    });
});

describe('layoutImageGrid', () => {
    it('draws every image when four or fewer', () => {
        const images = [1, 2, 3, 4].map(image);
        expect(layoutImageGrid(images)).toEqual({ tiles: images, overflow: 0 });
    });

    it('draws four and counts the rest as +n', () => {
        const images = Array.from({ length: 10 }, (_, i) => image(i));
        const layout = layoutImageGrid(images);
        expect(layout.tiles.map(t => t.id)).toEqual(['i0', 'i1', 'i2', 'i3']);
        expect(layout.overflow).toBe(6);
    });
});

describe('toChatImages', () => {
    it('shows a pending slot from its local preview, spinning while it is sent', () => {
        expect(
            toChatImages('row-1', [
                { localStatus: 'sending', localThumbUrl: 'blob:1' },
                { localStatus: 'failed', localThumbUrl: 'blob:2' },
            ])
        ).toEqual([
            { id: 'row-1:0', name: 'image-1', url: 'blob:1', isUploading: true, isFailed: false },
            { id: 'row-1:1', name: 'image-2', url: 'blob:2', isUploading: false, isFailed: true },
        ]);
    });

    it('shows a stored upload from its thumbnail, and opens the original', () => {
        expect(
            toChatImages('row-1', [{ id: 'up-1', status: 'stored', orgUrl: 'https://s/o', thumbUrl: 'https://s/t' }])
        ).toEqual([{ id: 'up-1', name: 'image-1', url: 'https://s/o', thumbUrl: 'https://s/t' }]);
    });

    it('falls back to the original when the upload has no thumbnail', () => {
        const [image] = toChatImages('row-1', [{ id: 'up-1', status: 'stored', orgUrl: 'https://s/o' }]);

        expect(image.thumbUrl).toBeUndefined();
        expect(image.url).toBe('https://s/o');
    });

    it('marks an upload the server failed, or one it reports with an error, as failed with nothing to load', () => {
        expect(
            toChatImages('row-1', [
                { id: 'up-1', status: 'failed' },
                { id: 'up-2', status: 'pending', error: '404 NOT_FOUND - gone' },
            ])
        ).toEqual([
            { id: 'up-1', name: 'image-1', url: '', isFailed: true },
            { id: 'up-2', name: 'image-2', url: '', isFailed: true },
        ]);
    });

    it('loads nothing from an address that is not a signed https one', () => {
        expect(
            toChatImages('row-1', [
                { id: 'up-1', status: 'stored', orgUrl: 'javascript:alert(1)' },
                { id: 'up-2', status: 'stored', orgUrl: 'https://s/o', thumbUrl: 'http://s/t' },
            ] as never)
        ).toEqual([
            { id: 'up-1', name: 'image-1', url: '', isFailed: true },
            { id: 'up-2', name: 'image-2', url: 'https://s/o' },
        ]);
    });

    it('shows an upload with no address yet as still on its way', () => {
        expect(toChatImages('row-1', [{ id: 'up-1', status: 'stored' }])).toEqual([
            { id: 'up-1', name: 'image-1', url: '', isUploading: true },
        ]);
    });

    it('has nothing for a message without uploads', () => {
        expect(toChatImages('row-1', undefined)).toEqual([]);
        expect(toChatImages('row-1', [])).toEqual([]);
    });
});
