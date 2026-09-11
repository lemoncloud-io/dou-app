import { describe, expect, it } from 'vitest';

import { MAX_ATTACHMENTS, attachmentKey, layoutImageGrid, validateAttachments, type ChatImage } from './chatImages';

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
