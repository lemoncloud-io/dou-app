import { clampFileProgress, formatFileSize, messageFileKind, splitFileName } from './messageFile';

describe('splitFileName', () => {
    it('splits the extension off with its dot', () => {
        expect(splitFileName('report.pdf')).toEqual({ base: 'report', extension: '.pdf' });
    });

    it('splits at the last dot only', () => {
        expect(splitFileName('minutes v1.2.hwpx')).toEqual({ base: 'minutes v1.2', extension: '.hwpx' });
    });

    // The server's rule: a dot that opens or closes the name does not start an extension.
    it.each(['.env', 'notes.', 'README'])('keeps %p whole', name => {
        expect(splitFileName(name)).toEqual({ base: name, extension: '' });
    });

    it('keeps the extension in the case it was written', () => {
        expect(splitFileName('Report.PDF').extension).toBe('.PDF');
    });
});

describe('messageFileKind', () => {
    it.each([
        ['a.pdf', 'pdf'],
        ['a.docx', 'doc'],
        ['a.doc', 'doc'],
        ['a.xlsx', 'sheet'],
        ['a.csv', 'sheet'],
        ['a.pptx', 'slides'],
        ['a.hwp', 'hangul'],
        ['a.hwpx', 'hangul'],
        ['a.txt', 'text'],
    ])('reads %p as %p', (name, kind) => {
        expect(messageFileKind(name)).toBe(kind);
    });

    it('ignores the case of the extension', () => {
        expect(messageFileKind('SCAN.PDF')).toBe('pdf');
    });

    it.each([undefined, '', 'archive.zip', 'no-extension', '.pdf'])('falls back to a generic file for %p', name => {
        expect(messageFileKind(name)).toBe('file');
    });
});

describe('formatFileSize', () => {
    it.each([
        [0, '0 KB'],
        [1, '1 KB'], // a non-empty file never reads as empty
        [512, '1 KB'],
        [1536, '2 KB'],
        [1024 * 1023, '1023 KB'],
        [1024 * 1023.6, '1 MB'], // decided on the rounded value, never "1024 KB"
        [1024 * 1024, '1 MB'],
        [1.5 * 1024 * 1024, '1.5 MB'],
        [12.34 * 1024 * 1024, '12.3 MB'],
        [50 * 1024 * 1024, '50 MB'],
        [300 * 1024 * 1024, '300 MB'], // the video ceiling reads as the number its refusal names
        [1023.99 * 1024 * 1024, '1 GB'],
        [2.25 * 1024 * 1024 * 1024, '2.3 GB'],
    ])('formats %p bytes as %p', (bytes, expected) => {
        expect(formatFileSize(bytes)).toBe(expected);
    });

    it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])('has nothing to show for %p', bytes => {
        expect(formatFileSize(bytes)).toBeUndefined();
    });
});

describe('clampFileProgress', () => {
    it('passes a ratio inside 0..1 through', () => {
        expect(clampFileProgress(0.42)).toBe(0.42);
    });

    it('clamps a ratio outside 0..1', () => {
        expect(clampFileProgress(-0.5)).toBe(0);
        expect(clampFileProgress(1.7)).toBe(1);
    });

    it.each([undefined, Number.NaN])('reports %p as unknown', progress => {
        expect(clampFileProgress(progress)).toBeUndefined();
    });
});
