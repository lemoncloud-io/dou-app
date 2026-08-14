import { describe, expect, it } from 'vitest';

import { parseBlocks } from './blockKit';

const wire = (blocks: unknown[]): string => JSON.stringify({ blocks });

describe('parseBlocks', () => {
    it('leaves a plain message alone', () => {
        expect(parseBlocks('hello there')).toBeNull();
        expect(parseBlocks('')).toBeNull();
        expect(parseBlocks(undefined)).toBeNull();
    });

    // The fast path: a message the server already labelled as text is never JSON.
    it('does not even try when contentType says text', () => {
        expect(parseBlocks(wire([{ type: 'divider' }]), 'text')).toBeNull();
    });

    it('survives broken JSON', () => {
        expect(parseBlocks('{"blocks": [')).toBeNull();
    });

    it('rejects JSON that is not a block payload', () => {
        expect(parseBlocks('{"hello":"world"}')).toBeNull();
        expect(parseBlocks('{"blocks":"nope"}')).toBeNull();
        expect(parseBlocks('[{"type":"divider"}]')).toBeNull();
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
