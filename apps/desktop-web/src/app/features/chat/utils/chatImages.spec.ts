import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import {
    MAX_ATTACHMENTS,
    attachmentKey,
    layoutImageGrid,
    toChatFiles,
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
        expect(result.rejected).toEqual({});
    });

    it('refuses a format the server does not take, keeping the rest', () => {
        const result = validateAttachments([], [file('a.7z', 'application/x-7z-compressed'), file('a.png')]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
        expect(result.rejected).toEqual({ unsupported: 1 });
    });

    it('takes videos and documents beside images, an untyped HWP included', () => {
        const result = validateAttachments(
            [],
            [file('clip.mp4', 'video/mp4'), file('a.pdf', 'application/pdf'), file('보고서.hwp', '')]
        );
        expect(result.accepted.map(f => f.name)).toEqual(['clip.mp4', 'a.pdf', '보고서.hwp']);
        expect(result.rejected).toEqual({});
    });

    // Chromium on Windows types a `.zip` as `application/x-zip-compressed`.
    it('takes a ZIP archive, however the system typed it', () => {
        const result = validateAttachments(
            [],
            [file('a.zip', 'application/zip'), file('b.zip', 'application/x-zip-compressed'), file('c.zip', '')]
        );
        expect(result.accepted.map(f => f.name)).toEqual(['a.zip', 'b.zip', 'c.zip']);
        expect(result.rejected).toEqual({});
    });

    // The server refuses these with a 413 after the whole transfer; the tray says so before it starts.
    it('refuses a file over its kind’s limit', () => {
        const MiB = 1024 * 1024;
        const result = validateAttachments(
            [],
            [
                file('big.png', 'image/png', 21 * MiB),
                file('long.mp4', 'video/mp4', 290 * MiB),
                file('big.pdf', 'application/pdf', 51 * MiB),
            ]
        );
        expect(result.accepted.map(f => f.name)).toEqual(['long.mp4']);
        expect(result.rejected).toEqual({ 'too-large': 2 });
    });

    it('holds a ZIP archive to the document limit, to the byte', () => {
        const limit = 50 * 1024 * 1024;
        const result = validateAttachments(
            [],
            [file('fits.zip', 'application/zip', limit), file('over.zip', 'application/zip', limit + 1)]
        );
        expect(result.accepted.map(f => f.name)).toEqual(['fits.zip']);
        expect(result.rejected).toEqual({ 'too-large': 1 });
    });

    // The server refuses a name over 255 UTF-8 bytes with a 400; a retry can only fail the same way.
    describe('a name over the server’s byte limit', () => {
        it('refuses a long Hangul name that fits in characters', () => {
            const name = `${'가'.repeat(84)}.png`;
            expect(name.length).toBeLessThan(255);
            const result = validateAttachments([], [file(name), file('a.png')]);
            expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
            expect(result.rejected).toEqual({ 'name-too-long': 1 });
        });

        it('allows exactly 255 bytes and refuses 256, for ASCII, Hangul and emoji', () => {
            const ok = [`${'a'.repeat(251)}.png`, `${'가'.repeat(83)}ab.png`, `${'😀'.repeat(62)}abc.png`];
            const long = [`${'a'.repeat(252)}.png`, `${'가'.repeat(83)}abc.png`, `${'😀'.repeat(62)}abcd.png`];
            expect(
                validateAttachments(
                    [],
                    ok.map(name => file(name))
                ).rejected
            ).toEqual({});
            const result = validateAttachments(
                [],
                long.map(name => file(name))
            );
            expect(result.accepted).toEqual([]);
            expect(result.rejected).toEqual({ 'name-too-long': 3 });
        });

        // The name that goes up carries the extension a document without one is given.
        it('measures the name as it is sent, with an added extension', () => {
            const pdf = (name: string) => file(name, 'application/pdf');
            expect(validateAttachments([], [pdf('a'.repeat(251))]).rejected).toEqual({});
            expect(validateAttachments([], [pdf('a'.repeat(252))]).rejected).toEqual({ 'name-too-long': 1 });
        });

        it('measures a decomposed name composed, as the server does', () => {
            const name = `${'가'.repeat(83)}.png`.normalize('NFD');
            expect(validateAttachments([], [file(name)]).rejected).toEqual({});
        });

        it('does not take a place in the tray', () => {
            const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => `k${i}`);
            const result = validateAttachments(existing, [file(`${'가'.repeat(90)}.png`), file('a.png')]);
            expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
            expect(result.rejected).toEqual({ 'name-too-long': 1 });
        });
    });

    // A re-pick of a file already in the tray, and the same file twice in one drop.
    it('refuses duplicates against the tray and within the batch', () => {
        const a = file('a.png');
        expect(validateAttachments([attachmentKey(a)], [a]).rejected).toEqual({ duplicate: 1 });
        const batch = validateAttachments([], [a, a]);
        expect(batch.accepted).toHaveLength(1);
        expect(batch.rejected).toEqual({ duplicate: 1 });
    });

    it('keeps the first files up to the limit and flags the overflow', () => {
        const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => `k${i}`);
        const result = validateAttachments(existing, [file('a.png'), file('b.png')]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png']);
        expect(result.rejected).toEqual({ limit: 1 });
    });

    it('keeps the first ten of a mixed pick of twelve, whatever their kinds, and counts the rest', () => {
        const kinds = [
            ['a.png', 'image/png'],
            ['b.mp4', 'video/mp4'],
            ['c.pdf', 'application/pdf'],
            ['d.hwp', ''],
        ];
        const picked = Array.from({ length: 12 }, (_, i) => file(`${i}-${kinds[i % 4][0]}`, kinds[i % 4][1]));
        const result = validateAttachments([], picked);
        expect(result.accepted.map(f => f.name)).toEqual(picked.slice(0, 10).map(f => f.name));
        expect(result.rejected).toEqual({ limit: 2 });
    });

    // Only the first refusal used to be reported, so a mixed drop hid the rest of what it left out.
    it('counts every refusal by reason', () => {
        const existing = Array.from({ length: MAX_ATTACHMENTS - 2 }, (_, i) => `k${i}`);
        const result = validateAttachments(existing, [
            file('x.heic', 'image/heic'),
            file('a.png'),
            file('a.png'),
            file('b.png'),
            file('c.png'),
            file('d.png'),
        ]);
        expect(result.accepted.map(f => f.name)).toEqual(['a.png', 'b.png']);
        expect(result.rejected).toEqual({ unsupported: 1, duplicate: 1, limit: 2 });
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

describe('toChatImages and toChatFiles', () => {
    const mixed = [
        { id: 'up-1', status: 'stored', stereo: 'image', orgUrl: 'https://s/o1' },
        {
            id: 'up-2',
            status: 'stored',
            stereo: 'file',
            name: 'report.pdf',
            contentType: 'application/pdf',
            contentSize: 2048,
            orgUrl: 'https://s/o2',
        },
        { id: 'up-3', status: 'stored', stereo: 'video', name: 'clip.mp4', orgUrl: 'https://s/o3' },
    ] as NonNullable<DomainChat['upload$$']>;

    // A PDF drawn by <img> is a broken tile; only images go to the grid and the viewer.
    it('gives the grid only the images, and the rest to the file list', () => {
        expect(toChatImages('row-1', mixed).map(image => image.id)).toEqual(['up-1']);
        // Numbered among the images, so a photo after a document is still "image-1".
        expect(toChatImages('row-1', [mixed[1], mixed[0]]).map(image => image.name)).toEqual(['image-1']);
        expect(toChatFiles('row-1', mixed)).toEqual([
            {
                id: 'up-2',
                kind: 'file',
                name: 'report.pdf',
                size: 2048,
                contentType: 'application/pdf',
                url: 'https://s/o2',
            },
            { id: 'up-3', kind: 'video', name: 'clip.mp4', url: 'https://s/o3' },
        ]);
    });

    it('shows a video or document being sent from the details its slot kept', () => {
        const slots = [
            {
                localStatus: 'sending',
                localThumbUrl: 'blob:1',
                localName: 'a.hwp',
                localContentType: 'application/x-hwp',
                localSize: 10,
            },
            {
                localStatus: 'failed',
                localThumbUrl: 'blob:2',
                localName: 'b.mp4',
                localContentType: 'video/mp4',
                localSize: 5,
            },
        ] as DomainChat['upload$$'];
        expect(toChatImages('row-1', slots)).toEqual([]);
        expect(toChatFiles('row-1', slots)).toEqual([
            {
                id: 'row-1:0',
                kind: 'file',
                name: 'a.hwp',
                size: 10,
                contentType: 'application/x-hwp',
                url: '',
                isUploading: true,
                isFailed: false,
            },
            {
                id: 'row-1:1',
                kind: 'video',
                name: 'b.mp4',
                size: 5,
                contentType: 'video/mp4',
                url: '',
                isUploading: false,
                isFailed: true,
            },
        ]);
    });

    it('has nothing to load for a failed upload, one still on its way, or an unsafe address', () => {
        expect(
            toChatFiles('row-1', [
                { id: 'a', status: 'failed', stereo: 'file' },
                { id: 'b', status: 'stored', stereo: 'file' },
                { id: 'c', status: 'stored', stereo: 'video', orgUrl: 'javascript:alert(1)' },
            ] as DomainChat['upload$$'])
        ).toEqual([
            { id: 'a', kind: 'file', url: '', isFailed: true },
            { id: 'b', kind: 'file', url: '', isUploading: true },
            { id: 'c', kind: 'video', url: '', isFailed: true },
        ]);
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

    // An upload sent before the server kept names has none; its place in the message stands in.
    it('names a stored image by the name it was sent under, when the server kept one', () => {
        expect(
            toChatImages('row-1', [
                { id: 'up-1', status: 'stored', name: 'orange.png', orgUrl: 'https://s/o' },
                { id: 'up-2', status: 'stored', orgUrl: 'https://s/o2' },
            ]).map(image => image.name)
        ).toEqual(['orange.png', 'image-2']);
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
