import { Blob as NodeBlob } from 'node:buffer';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { buildZip, fitsInZip, uniqueNames, ZIP_SIZE_LIMIT } from './zipDownload';

const blob = (parts: string[], type = '') => new NodeBlob(parts, { type }) as unknown as Blob;

const joined = (chunks: Uint8Array[]) => {
    const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    chunks.reduce((offset, chunk) => (out.set(chunk, offset), offset + chunk.length), 0);
    return out;
};

const zipOf = async (files: { name: string; blob: Blob }[]) => joined(await buildZip(files));

describe('buildZip', () => {
    it('holds every file under its own Korean name, flagged as UTF-8', async () => {
        const zip = await zipOf([
            { name: '가나상사_보고서.pdf', blob: blob(['%PDF a']) },
            { name: '다라전자_보고서.pdf', blob: blob(['%PDF b']) },
        ]);
        const entries = unzipSync(zip);
        expect(Object.keys(entries)).toEqual(['가나상사_보고서.pdf', '다라전자_보고서.pdf']);
        expect(strFromU8(entries['다라전자_보고서.pdf'])).toBe('%PDF b');
        const generalPurposeFlag = zip[6] | (zip[7] << 8);
        expect(generalPurposeFlag & 0x800).toBe(0x800);
    });

    it('keeps both of two files with one name', async () => {
        const entries = unzipSync(
            await zipOf([
                { name: 'report.pdf', blob: blob(['1']) },
                { name: 'report.pdf', blob: blob(['2']) },
            ])
        );
        expect(Object.keys(entries)).toEqual(['report.pdf', 'report (1).pdf']);
    });

    it('gives a nameless file the extension its bytes have, as a single save does', async () => {
        const names: string[] = [];
        unzipSync(
            await zipOf([
                { name: 'file', blob: blob(['%PDF'], 'application/pdf') },
                { name: '__proto__', blob: blob(['x']) },
            ]),
            { filter: entry => (names.push(entry.name), false) }
        );
        expect(names).toEqual(['file.pdf', '__proto__']);
    });
});

describe('uniqueNames', () => {
    it('numbers repeats case-insensitively and keeps a name inside the archive root', () => {
        expect(uniqueNames(['a.pdf', 'A.pdf', '../x/b.txt', 'notes', 'notes'])).toEqual([
            'a.pdf',
            'A (1).pdf',
            '.._x_b.txt',
            'notes',
            'notes (1)',
        ]);
    });

    it('replaces what Windows refuses in a name and treats decomposed Korean as the same name', () => {
        const composed = '보고서.pdf';
        expect(uniqueNames(['a:b?.pdf', composed.normalize('NFD'), composed])).toEqual([
            'a_b_.pdf',
            composed,
            '보고서 (1).pdf',
        ]);
    });
});

describe('fitsInZip', () => {
    it('takes files up to the limit together and refuses past it', () => {
        expect(fitsInZip([{ name: 'a', size: ZIP_SIZE_LIMIT }])).toBe(true);
        expect(
            fitsInZip([
                { name: 'a', size: ZIP_SIZE_LIMIT },
                { name: 'b', size: 1 },
            ])
        ).toBe(false);
    });
});
