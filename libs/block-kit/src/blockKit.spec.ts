import { describe, expect, it } from 'vitest';

import { parseBlocks } from './blockKit';

const wire = (blocks: unknown[]): string => JSON.stringify({ blocks });

describe('parseBlocks', () => {
    it('leaves a plain message alone', () => {
        expect(parseBlocks('hello there')).toBeNull();
        expect(parseBlocks('')).toBeNull();
        expect(parseBlocks(undefined)).toBeNull();
    });

    it('reads a payload whatever the message was labelled', () => {
        expect(parseBlocks(wire([{ type: 'divider' }]))).toEqual([{ type: 'divider' }]);
    });

    it('survives broken JSON', () => {
        expect(parseBlocks('{"blocks": [')).toBeNull();
        expect(parseBlocks('{')).toBeNull();
        expect(parseBlocks('  {  ')).toBeNull();
    });

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

    it('keeps an unsupported block as its raw source', () => {
        const parsed = parseBlocks(wire([{ type: 'actions', elements: [{ type: 'button' }] }]));
        expect(parsed).toEqual([{ type: 'unknown', raw: '{"type":"actions","elements":[{"type":"button"}]}' }]);
    });

    it('treats a malformed supported block as unknown rather than drawing nothing', () => {
        const parsed = parseBlocks(wire([{ type: 'header' }, { type: 'section' }, 'not-an-object']));
        expect(parsed?.every(b => b.type === 'unknown')).toBe(true);
    });

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
