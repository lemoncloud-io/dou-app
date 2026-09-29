import { join } from 'node:path';

import { createDownloadTargets, savesWithoutAsking } from './downloads';

const DIR = '/Users/ada/Downloads';

/** A Downloads folder holding `names`, standing in for the disk. */
const targetsWith = (...names: string[]) => {
    const onDisk = new Set(names.map(name => join(DIR, name)));
    return createDownloadTargets(DIR, path => onDisk.has(path));
};

describe('createDownloadTargets', () => {
    it('saves under the suggested name when nothing is there', () => {
        expect(targetsWith().reserve('image-1.png')).toBe(join(DIR, 'image-1.png'));
    });

    it('numbers the name past every file already on disk', () => {
        const targets = targetsWith('image.png', 'image (1).png');
        expect(targets.reserve('image.png')).toBe(join(DIR, 'image (2).png'));
    });

    it('gives the same name distinct paths while the first download is still in flight', () => {
        const targets = targetsWith();
        expect([targets.reserve('image.png'), targets.reserve('image.png'), targets.reserve('image.png')]).toEqual([
            join(DIR, 'image.png'),
            join(DIR, 'image (1).png'),
            join(DIR, 'image (2).png'),
        ]);
    });

    it('treats names differing only in case as the same file', () => {
        const targets = targetsWith();
        targets.reserve('image.png');
        expect(targets.reserve('Image.png')).toBe(join(DIR, 'Image (1).png'));
    });

    it('frees a name once its download is done', () => {
        const targets = targetsWith();
        const first = targets.reserve('image.png');
        targets.release(first);
        expect(targets.reserve('image.png')).toBe(first);
    });

    it('keeps a name that carries a path inside the Downloads folder', () => {
        expect(targetsWith().reserve('../../etc/image.png')).toBe(join(DIR, 'image.png'));
        expect(targetsWith().reserve('..')).toBe(join(DIR, 'download'));
    });

    it('names an unnamed download and numbers one without an extension', () => {
        const targets = targetsWith('notes');
        expect(targets.reserve('')).toBe(join(DIR, 'download'));
        expect(targets.reserve('notes')).toBe(join(DIR, 'notes (1)'));
    });
});

describe('savesWithoutAsking', () => {
    it('saves an image whose type and extension agree', () => {
        expect(savesWithoutAsking('image-1.png', 'image/png')).toBe(true);
        expect(savesWithoutAsking('Photo.JPEG', 'image/jpeg')).toBe(true);
        expect(savesWithoutAsking('a.webp', 'image/webp')).toBe(true);
        expect(savesWithoutAsking('a.gif', 'image/gif')).toBe(true);
    });

    it('asks for anything that is not an image', () => {
        expect(savesWithoutAsking('run.command', 'application/octet-stream')).toBe(false);
        expect(savesWithoutAsking('notes.pdf', 'application/pdf')).toBe(false);
    });

    it('asks when the name and the type disagree', () => {
        expect(savesWithoutAsking('run.command', 'image/png')).toBe(false);
        expect(savesWithoutAsking('image-1', 'image/png')).toBe(false);
        expect(savesWithoutAsking('image-1.png', 'text/html')).toBe(false);
        expect(savesWithoutAsking('image-1.png', 'image/jpeg')).toBe(false);
    });

    it('asks, without throwing, for a type that names an object member', () => {
        expect(savesWithoutAsking('image-1.png', 'constructor')).toBe(false);
        expect(savesWithoutAsking('image-1.png', '__proto__')).toBe(false);
    });
});
