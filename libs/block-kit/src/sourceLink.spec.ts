import { describe, expect, it } from 'vitest';

import type { KnownBlock } from './blockKit';
import { WEBHOOK_BLOCKS_ERROR_REPORT } from './sampleWebhookBlocks';
import { takeSourceLink } from './sourceLink';
import { toBlocks } from './blockKit';

const header: KnownBlock = { type: 'header', text: { type: 'plain_text', text: '503' } };
const context = (...texts: string[]): KnownBlock => ({
    type: 'context',
    elements: texts.map(text => ({ type: 'mrkdwn' as const, text })),
});

describe('takeSourceLink', () => {
    it("takes the server's source link off the context line of the server's own error card", () => {
        const { blocks, sourceUrl } = takeSourceLink(toBlocks([...WEBHOOK_BLOCKS_ERROR_REPORT]));

        expect(sourceUrl).toBe('https://example.com/reports/2026-09-07/report.json');
        const last = blocks[blocks.length - 1];
        expect(last).toEqual(context('hello-alarm', 'example-api/production#1.0.0'));
    });

    it('drops a context line the link was the only thing on', () => {
        const { blocks, sourceUrl } = takeSourceLink([header, context('<https://x.dev/r.json|원문 보기>')]);

        expect(sourceUrl).toBe('https://x.dev/r.json');
        expect(blocks).toEqual([header]);
    });

    // With no heading there is nowhere to move it, so the link stays where it can still be pressed.
    it('leaves the link in place when there is no heading', () => {
        const input = [context('<https://x.dev/r.json|원문 보기>')];
        expect(takeSourceLink(input)).toEqual({ blocks: input });
    });

    it.each([
        ['a link with another label', '<https://x.dev|View Actions Run>'],
        ['a link that is not last on the line', '<https://x.dev/r.json|원문 보기> more'],
        ['a scheme the OS browser must not get', '<javascript:alert(1)|원문 보기>'],
    ])('leaves %s alone', (_, text) => {
        const input = [header, context(text)];
        expect(takeSourceLink(input)).toEqual({ blocks: input });
    });

    // A mrkdwn heading can hold its own links, which cannot sit inside the source link.
    it('leaves the link in place when the heading is not plain text', () => {
        const input: KnownBlock[] = [
            { type: 'header', text: { type: 'mrkdwn', text: 'Deploy <https://x.dev/42|#42>' } },
            context('<https://x.dev/r.json|원문 보기>'),
        ];
        expect(takeSourceLink(input)).toEqual({ blocks: input });
    });

    it('reads only the last context block, which is where the server appends it', () => {
        const input = [header, context('<https://x.dev/r.json|원문 보기>'), context('by louis-lemon')];
        expect(takeSourceLink(input)).toEqual({ blocks: input });
    });
});
