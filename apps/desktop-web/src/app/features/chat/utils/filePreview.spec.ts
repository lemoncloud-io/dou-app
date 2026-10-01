import { describe, expect, it } from 'vitest';

// jsdom's Blob has no `arrayBuffer`; a browser's and Node's do.
import { Blob as NodeBlob } from 'node:buffer';

import type { ChatFile } from './chatImages';
import { TEXT_PREVIEW_MAX_BYTES, canPreview, readTextPreview } from './filePreview';

const bytes = (parts: (string | Uint8Array)[]): Blob => new NodeBlob(parts) as unknown as Blob;

const sent = (file: Partial<ChatFile>): ChatFile => ({ id: 'f', kind: 'file', url: 'https://s/f', ...file });

describe('canPreview', () => {
    it('opens a sent PDF or text file, by its type or its name', () => {
        expect(canPreview(sent({ name: 'a.pdf', contentType: 'application/pdf' }))).toBe('pdf');
        expect(canPreview(sent({ name: 'report.pdf' }))).toBe('pdf');
        expect(canPreview(sent({ name: 'notes.txt', contentType: 'text/plain' }))).toBe('text');
        expect(canPreview(sent({ name: 'NOTES.TXT' }))).toBe('text');
    });

    // Nothing in the browser draws these without sending the file to someone else.
    it('leaves office, Hancom and video files to their save card', () => {
        expect(canPreview(sent({ name: 'a.docx' }))).toBeNull();
        expect(canPreview(sent({ name: 'a.hwp' }))).toBeNull();
        expect(canPreview(sent({ name: 'a.xlsx' }))).toBeNull();
        expect(canPreview(sent({ kind: 'video', name: 'a.mp4', contentType: 'video/mp4' }))).toBeNull();
    });

    it('has nothing to open while a file is sent, when it failed, or without an address', () => {
        expect(canPreview(sent({ name: 'a.pdf', url: '', isUploading: true }))).toBeNull();
        expect(canPreview(sent({ name: 'a.pdf', url: '', isFailed: true }))).toBeNull();
        expect(canPreview(sent({ name: 'a.pdf', url: '' }))).toBeNull();
        expect(canPreview(sent({}))).toBeNull();
    });
});

describe('readTextPreview', () => {
    it('reads a UTF-8 file whole when it is small', async () => {
        await expect(readTextPreview(bytes(['안녕 hello']))).resolves.toEqual({
            text: '안녕 hello',
            truncated: false,
        });
    });

    it('reads an empty file as empty', async () => {
        await expect(readTextPreview(bytes([]))).resolves.toEqual({ text: '', truncated: false });
    });

    // A .txt saved by Korean Windows is often CP949; read as UTF-8 it is all replacement marks.
    it('falls back to EUC-KR when the bytes are not UTF-8', async () => {
        const euckr = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7]); // "안녕"
        await expect(readTextPreview(bytes([euckr]))).resolves.toEqual({ text: '안녕', truncated: false });
    });

    it('reads a UTF-16 file by its byte-order mark', async () => {
        const le = new Uint8Array([0xff, 0xfe, 0x5c, 0xd5, 0x00, 0xae]); // BOM + "한글"
        await expect(readTextPreview(bytes([le]))).resolves.toEqual({ text: '한글', truncated: false });
    });

    // The viewer fetches only the start; the card's size says whether there is more.
    it('takes the whole file size to say whether the start was cut', async () => {
        await expect(readTextPreview(bytes(['abc']), 10 * 1024 * 1024)).resolves.toEqual({
            text: 'abc',
            truncated: true,
        });
        await expect(readTextPreview(bytes(['abc']), 3)).resolves.toEqual({ text: 'abc', truncated: false });
    });

    it('reads only the first part of a large file, without breaking a character at the cut', async () => {
        const big = bytes(['가'.repeat(TEXT_PREVIEW_MAX_BYTES)]); // 3 bytes each
        const preview = await readTextPreview(big);
        expect(preview.truncated).toBe(true);
        expect(preview.text.length).toBe(Math.floor(TEXT_PREVIEW_MAX_BYTES / 3));
        expect(preview.text).not.toContain('�');
    });
});
