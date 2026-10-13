import { describe, expect, it } from 'vitest';

import { splitFences } from './fences';

describe('splitFences', () => {
    it('keeps text with no fence as one text segment', () => {
        expect(splitFences('hello `x`')).toEqual([{ type: 'text', value: 'hello `x`' }]);
    });

    it('carves out a plain fenced block, dropping the newline after the opening and before the closing fence', () => {
        expect(splitFences('before\n```\nls -la\n```\nafter')).toEqual([
            { type: 'text', value: 'before\n' },
            { type: 'code', value: 'ls -la' },
            { type: 'text', value: '\nafter' },
        ]);
    });

    it('reads a word right after the opening fence as the language, not as the first code line', () => {
        expect(splitFences('```sh\ngit clone x\n```')).toEqual([{ type: 'code', value: 'git clone x', lang: 'sh' }]);
    });

    it('reads the language past trailing spaces or a CRLF, as the web client does', () => {
        expect(splitFences('```sh \nls\n```')).toEqual([{ type: 'code', value: 'ls', lang: 'sh' }]);
        expect(splitFences('```sh\r\nls\n```')).toEqual([{ type: 'code', value: 'ls', lang: 'sh' }]);
    });

    it('drops the CRLF around a body pasted from Windows', () => {
        expect(splitFences('```\r\nls\r\n```')).toEqual([{ type: 'code', value: 'ls' }]);
    });

    it('keeps a first line that is not a bare word as code', () => {
        expect(splitFences('```echo hi\n```')).toEqual([{ type: 'code', value: 'echo hi' }]);
    });

    it('pairs a four-backtick fence with its own closing run, leaving no stray backtick', () => {
        expect(splitFences('````sh\nA\n````')).toEqual([{ type: 'code', value: 'A', lang: 'sh' }]);
    });

    it('keeps a shorter backtick run inside a longer fence as code', () => {
        expect(splitFences('````\n```\nnested\n```\n````')).toEqual([{ type: 'code', value: '```\nnested\n```' }]);
    });

    it('lets a longer closing run close the block and consumes all of it', () => {
        expect(splitFences('```a````')).toEqual([{ type: 'code', value: 'a' }]);
    });

    it('still reads a one-line fence in the middle of a sentence', () => {
        expect(splitFences('run ```npm ci``` first')).toEqual([
            { type: 'text', value: 'run ' },
            { type: 'code', value: 'npm ci' },
            { type: 'text', value: ' first' },
        ]);
    });

    it('leaves an unclosed fence as text', () => {
        expect(splitFences('look ```here')).toEqual([{ type: 'text', value: 'look ```here' }]);
    });

    it('reads two blocks in one message', () => {
        expect(splitFences('```\na\n```\n```\nb\n```')).toEqual([
            { type: 'code', value: 'a' },
            { type: 'text', value: '\n' },
            { type: 'code', value: 'b' },
        ]);
    });

    it('returns nothing for an empty string', () => {
        expect(splitFences('')).toEqual([]);
    });
});
