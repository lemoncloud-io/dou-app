import type { DomainChat } from '@chatic/data';

import { imageOriginalAt, isPendingImageChat, toImageTiles } from './imageTiles';

type Uploads = NonNullable<DomainChat['upload$$']>;

const sent = (id: string, extra: Record<string, unknown> = {}) =>
    ({
        id,
        status: 'stored',
        orgUrl: `https://s3/${id}`,
        thumbUrl: `https://s3/${id}-thumb`,
        ...extra,
    }) as Uploads[number];
const local = (status: 'sending' | 'failed', url = 'blob:x') => ({ localStatus: status, localThumbUrl: url });

describe('toImageTiles', () => {
    it('draws a sent image from its thumbnail, falling back to the original', () => {
        const tiles = toImageTiles([sent('a'), sent('b', { thumbUrl: undefined })]);

        expect(tiles).toEqual([
            { key: 'a', src: 'https://s3/a-thumb', state: 'ready' },
            { key: 'b', src: 'https://s3/b', state: 'ready' },
        ]);
    });

    // The server keeps a missing, foreign or unfinished upload in the list as `failed` so the count
    // still matches what was sent; the row must keep its place too.
    it.each([
        ['marked failed', { status: 'failed' }],
        ['carrying an error', { error: '404 NOT FOUND - upload' }],
        ['with no address at all', { orgUrl: undefined, thumbUrl: undefined }],
    ])('keeps an upload %s as a broken tile', (_label, extra) => {
        expect(toImageTiles([sent('a', extra)])[0].state).toBe('broken');
    });

    it('draws a message still on its way from its local previews', () => {
        expect(toImageTiles([local('sending', 'blob:1'), local('failed', 'blob:2')] as Uploads)).toEqual([
            { key: 'local-0', src: 'blob:1', state: 'sending' },
            { key: 'local-1', src: 'blob:2', state: 'failed' },
        ]);
    });

    it('is empty for a chat with no images', () => {
        expect(toImageTiles(undefined)).toEqual([]);
        expect(toImageTiles(null)).toEqual([]);
    });
});

describe('imageOriginalAt', () => {
    it('opens the original of a sent image and the preview of an unsent one', () => {
        const uploads = [sent('a'), local('sending', 'blob:1')] as Uploads;

        expect(imageOriginalAt(uploads, 0)).toBe('https://s3/a');
        expect(imageOriginalAt(uploads, 1)).toBe('blob:1');
        expect(imageOriginalAt(uploads, 5)).toBeUndefined();
    });
});

describe('isPendingImageChat', () => {
    it('is true only while local slots are in the list', () => {
        expect(isPendingImageChat({ upload$$: [local('failed')] as Uploads })).toBe(true);
        expect(isPendingImageChat({ upload$$: [sent('a')] })).toBe(false);
        expect(isPendingImageChat({})).toBe(false);
    });
});
