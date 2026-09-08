import { describe, expect, it } from 'vitest';

import { parseBlocks } from './blockKit';

const wire = (blocks: unknown[]): string => JSON.stringify({ blocks });

describe('parseBlocks', () => {
    it('leaves a plain message alone', () => {
        expect(parseBlocks('hello there')).toBeNull();
        expect(parseBlocks('')).toBeNull();
        expect(parseBlocks(undefined)).toBeNull();
    });

    // The `contentType` marker is not consulted at all: this client's own send path
    // stamps `'text'` by default, so a marker-gated reader would answer "no" to
    // everything and the whole feature would sit dead behind a green suite.
    it('reads a payload whatever the message was labelled', () => {
        expect(parseBlocks(wire([{ type: 'divider' }]))).toEqual([{ type: 'divider' }]);
    });

    // A message body that merely starts with a brace gets as far as `JSON.parse` and no
    // further. Someone typing `{` is the shortest input that reaches the parser, so it is
    // the one that proves the throw is caught rather than escaping into a render.
    it('survives broken JSON', () => {
        expect(parseBlocks('{"blocks": [')).toBeNull();
        expect(parseBlocks('{')).toBeNull();
        expect(parseBlocks('  {  ')).toBeNull();
    });

    // `{"blocks":[]}` is well-formed and still has nothing to draw. It has to read as plain
    // text, not as an empty block list — a caller handed `[]` would clear the bubble and
    // render a message with no body at all.
    it('rejects JSON that is not a block payload', () => {
        expect(parseBlocks('{"hello":"world"}')).toBeNull();
        expect(parseBlocks('{"blocks":"nope"}')).toBeNull();
        expect(parseBlocks('[{"type":"divider"}]')).toBeNull();
        expect(parseBlocks('{"blocks":[]}')).toBeNull();
    });

    it('parses the supported blocks', () => {
        const parsed = parseBlocks(
            wire([
                { type: 'header', text: { type: 'plain_text', text: 'Report' } },
                { type: 'divider' },
                { type: 'section', text: { type: 'mrkdwn', text: '*bold*' } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: 'ago' }] },
            ])
        );
        expect(parsed?.map(b => b.type)).toEqual(['header', 'divider', 'section', 'context']);
    });

    // The whole point of the fallback: what we cannot draw, we can still show.
    it('keeps an unsupported block as its raw source', () => {
        const parsed = parseBlocks(wire([{ type: 'actions', elements: [{ type: 'button' }] }]));
        expect(parsed).toEqual([{ type: 'unknown', raw: '{"type":"actions","elements":[{"type":"button"}]}' }]);
    });

    it('treats a malformed supported block as unknown rather than drawing nothing', () => {
        const parsed = parseBlocks(wire([{ type: 'header' }, { type: 'section' }, 'not-an-object']));
        expect(parsed?.every(b => b.type === 'unknown')).toBe(true);
    });

    // Nothing caps the list, and nothing should — a sender that ships 500 blocks gets 500
    // back rather than a silently truncated message. This also pins that the reader stays
    // iterative: a recursive one would blow the stack here instead of failing a length check.
    it('carries a large payload through without capping or recursing', () => {
        const many = Array.from({ length: 500 }, (_, i) => ({
            type: 'section',
            text: { type: 'mrkdwn', text: `line ${i}` },
        }));

        const parsed = parseBlocks(wire(many));

        expect(parsed).toHaveLength(500);
        expect(parsed?.every(block => block.type === 'section')).toBe(true);
    });

    it('reads a section with fields and no text', () => {
        const parsed = parseBlocks(
            wire([
                {
                    type: 'section',
                    fields: [
                        { type: 'mrkdwn', text: 'High' },
                        { type: 'plain_text', text: 'Silly' },
                    ],
                },
            ])
        );
        expect(parsed?.[0].type).toBe('section');
    });
});
