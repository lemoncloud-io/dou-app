import { describe, expect, it } from 'vitest';

// jsdom's Blob has no `arrayBuffer`; a browser's and Node's do.
import { Blob as NodeBlob } from 'node:buffer';

import type { ChatFile } from './chatImages';
import {
    HTML_PREVIEW_MAX_BYTES,
    TEXT_PREVIEW_MAX_BYTES,
    canPreview,
    formatPlaybackTime,
    htmlPreviewDocument,
    readTextPreview,
} from './filePreview';

describe('formatPlaybackTime', () => {
    it('reads m:ss, and h:mm:ss from an hour, rounded down', () => {
        expect(formatPlaybackTime(2.9)).toBe('0:02');
        expect(formatPlaybackTime(125)).toBe('2:05');
        expect(formatPlaybackTime(3725)).toBe('1:02:05');
    });

    // The browser reports NaN before the header arrives, and Infinity for a stream.
    it('reads a length it does not know as 0:00', () => {
        expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
        expect(formatPlaybackTime(Number.POSITIVE_INFINITY)).toBe('0:00');
        expect(formatPlaybackTime(-1)).toBe('0:00');
    });
});

const bytes = (parts: (string | Uint8Array)[]): Blob => new NodeBlob(parts) as unknown as Blob;

const sent = (file: Partial<ChatFile>): ChatFile => ({ id: 'f', kind: 'file', url: 'https://s/f', ...file });

describe('canPreview', () => {
    it('opens a sent PDF or text file, by its type or its name', () => {
        expect(canPreview(sent({ name: 'a.pdf', contentType: 'application/pdf' }))).toBe('pdf');
        expect(canPreview(sent({ name: 'report.pdf' }))).toBe('pdf');
        expect(canPreview(sent({ name: 'notes.txt', contentType: 'text/plain' }))).toBe('text');
        expect(canPreview(sent({ name: 'NOTES.TXT' }))).toBe('text');
    });

    // A voice file plays in the page; macOS types an M4A `audio/x-m4a`.
    it('plays a sent voice file, by its type or its name', () => {
        expect(canPreview(sent({ name: 'song.mp3', contentType: 'audio/mpeg' }))).toBe('audio');
        expect(canPreview(sent({ name: 'memo.m4a', contentType: 'audio/x-m4a' }))).toBe('audio');
        expect(canPreview(sent({ name: 'take.wav' }))).toBe('audio');
        expect(canPreview(sent({ name: 'voice.ogg', contentType: 'audio/ogg' }))).toBe('audio');
    });

    // Nothing in the browser draws these without sending the file to someone else.
    it('leaves office, Hancom, archive and video files to their save card', () => {
        expect(canPreview(sent({ name: 'a.docx' }))).toBeNull();
        expect(canPreview(sent({ name: 'a.hwp' }))).toBeNull();
        expect(canPreview(sent({ name: 'a.xlsx' }))).toBeNull();
        expect(canPreview(sent({ name: 'a.zip', contentType: 'application/zip' }))).toBeNull();
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

describe('HTML preview', () => {
    it('opens a sent HTML page, by its type or its name', () => {
        expect(canPreview(sent({ name: 'report.html', contentType: 'text/html' }))).toBe('html');
        expect(canPreview(sent({ name: 'old.htm' }))).toBe('html');
        expect(canPreview(sent({ name: 'report.html', contentType: 'text/html', isUploading: true }))).toBeNull();
    });

    const policyOf = (doc: string): string =>
        /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(doc)?.[1] ?? '';

    it('puts a policy ahead of the page that loads nothing from the network and runs no script', () => {
        const policy = policyOf(htmlPreviewDocument('<p>hi</p>'));
        expect(policy).toContain("default-src 'none'");
        expect(policy).not.toMatch(/script-src|https?:|\*/);
        expect(policy).toContain('img-src data:');
    });

    const parsed = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html');
    const policyInHead = (doc: string): boolean =>
        parsed(doc).head.firstElementChild?.getAttribute('http-equiv') === 'Content-Security-Policy';

    // Anything ahead of the doctype would drop the page into quirks mode and change its layout.
    it('keeps the doctype first and the policy first in the head', () => {
        const doc = htmlPreviewDocument(
            '\uFEFF  <!DOCTYPE html>\n<html lang="ko"><head><title>x</title></head></html>'
        );
        expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(policyInHead(doc)).toBe(true);
        expect(parsed(doc).documentElement.lang).toBe('ko');
    });

    it('keeps the doctype of a page saved with a comment ahead of it', () => {
        const doc = htmlPreviewDocument('<!-- saved from url=(0014)about:internet -->\n<!DOCTYPE html><html></html>');
        expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(policyInHead(doc)).toBe(true);
    });

    // A policy outside the head is ignored, so a page that starts its body early must not get one there.
    it.each([['<!-->'], ['<!--->'], ['<!-- a --!>']])(
        'puts the policy in the head of a page whose comment %s closes early',
        opener => {
            const doc = htmlPreviewDocument(
                `${opener}<img src="https://example.com/p.png"><!-- --><!doctype html><p>x</p>`
            );
            expect(policyInHead(doc)).toBe(true);
            const page = parsed(doc);
            expect(page.head.contains(page.querySelector('img'))).toBe(false);
        }
    );

    it('gives links without a target of their own one the frame refuses, ahead of any base of the page', () => {
        const doc = htmlPreviewDocument('<base href="https://example.com/" target="_self"><a href="/x">x</a>');
        expect(doc.indexOf('<base target="_blank">')).toBeLessThan(doc.indexOf('<base href='));
    });

    it('lets an HTML page be read up to its own larger allowance', async () => {
        expect(HTML_PREVIEW_MAX_BYTES).toBeGreaterThan(TEXT_PREVIEW_MAX_BYTES);
        const page = await readTextPreview(
            bytes(['<p>', 'x'.repeat(2 * 1024 * 1024), '</p>']),
            undefined,
            HTML_PREVIEW_MAX_BYTES
        );
        expect(page.truncated).toBe(false);
        expect(page.text.endsWith('</p>')).toBe(true);
    });
});
