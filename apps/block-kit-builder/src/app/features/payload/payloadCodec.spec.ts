import { describe, expect, it } from 'vitest';

import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import { blocksToPayloadJson, payloadJsonToBlocks } from './payloadCodec';

const BLOCKS: KnownBlock[] = toBlocks([
    { type: 'header', text: { type: 'plain_text', text: 'Error report' } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*503* ECONNRESET' } },
]);

describe('blocksToPayloadJson', () => {
    it('emits the wire shape a channel message carries', () => {
        expect(JSON.parse(blocksToPayloadJson(BLOCKS))).toEqual({ blocks: BLOCKS });
    });
});

describe('payloadJsonToBlocks', () => {
    // The pane is an editor from slice 06 on, so what it writes has to come back
    // as what it drew. Anything lost here is a card that changes on its own.
    it('round-trips what the payload pane shows', () => {
        const result = payloadJsonToBlocks(blocksToPayloadJson(BLOCKS));
        expect(result).toEqual({ ok: true, blocks: BLOCKS });
    });

    // A block the renderer cannot draw is kept, not rejected: the builder reads a
    // payload the same way desktop-web does, so an `actions` block shows its source
    // here instead of being accepted and surprising someone in a channel.
    it('keeps an undrawable block as unknown rather than refusing the payload', () => {
        const result = payloadJsonToBlocks('{"blocks":[{"type":"actions"}]}');
        expect(result).toEqual({ ok: true, blocks: [{ type: 'unknown', raw: '{"type":"actions"}' }] });
    });

    it.each([
        ['', 'Payload is empty.'],
        ['[]', 'Top level must be an object.'],
        ['{"nope":1}', 'Missing a "blocks" array.'],
        ['{"blocks":[]}', '"blocks" is empty.'],
    ])('names what is wrong with %j', (json, error) => {
        expect(payloadJsonToBlocks(json)).toEqual({ ok: false, error });
    });

    // Never throws — an unreadable payload is a message to show, not a crash.
    it('reports malformed JSON instead of throwing', () => {
        const result = payloadJsonToBlocks('{"blocks":[');
        expect(result.ok).toBe(false);
    });
});
