import { describe, expect, it } from 'vitest';

import type { KnownBlock } from './blockKit';
import { WEBHOOK_BLOCKS_ERROR_REPORT } from './sampleWebhookBlocks';
import { isWebUrl, takeSourceLink } from './sourceLink';
import { toBlocks } from './blockKit';

const header: KnownBlock = { type: 'header', text: { type: 'plain_text', text: '503' } };
const context = (...texts: string[]): KnownBlock => ({
    type: 'context',
    elements: texts.map(text => ({ type: 'mrkdwn' as const, text })),
});

describe('takeSourceLink', () => {
    describe('from the context line (a message stored before source$)', () => {
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

        it.each([
            ['no heading', [context('<https://x.dev/r.json|원문 보기>')]],
            [
                'a mrkdwn heading',
                [
                    { type: 'header', text: { type: 'mrkdwn', text: 'Deploy <https://x.dev/42|#42>' } },
                    context('<https://x.dev/r.json|원문 보기>'),
                ] as KnownBlock[],
            ],
        ])('takes it with %s', (_, input) => {
            const { blocks, sourceUrl } = takeSourceLink(input);
            expect(sourceUrl).toBe('https://x.dev/r.json');
            expect(blocks.some(block => block.type === 'context')).toBe(false);
        });

        it.each([
            ['a link with another label', '<https://x.dev|View Actions Run>'],
            ['a link that is not last on the line', '<https://x.dev/r.json|원문 보기> more'],
            ['a scheme the OS browser must not get', '<javascript:alert(1)|원문 보기>'],
        ])('leaves %s alone', (_, text) => {
            const input = [header, context(text)];
            expect(takeSourceLink(input)).toEqual({ blocks: input });
        });

        it('reads only the last context block, which is where the server appends it', () => {
            const input = [header, context('<https://x.dev/r.json|원문 보기>'), context('by someone')];
            expect(takeSourceLink(input)).toEqual({ blocks: input });
        });
    });

    describe('from source$.url', () => {
        it('reads the field first and still takes the line, so the link shows once', () => {
            const { blocks, sourceUrl } = takeSourceLink(
                [header, context('footer', '<https://x.dev/r.json|원문 보기>')],
                {
                    url: 'https://x.dev/r.json',
                }
            );
            expect(sourceUrl).toBe('https://x.dev/r.json');
            expect(blocks).toEqual([header, context('footer')]);
        });

        it('wins over a line that names another address', () => {
            const { blocks, sourceUrl } = takeSourceLink([header, context('<https://old.dev/r.json|원문 보기>')], {
                url: ' https://new.dev/r.json ',
            });
            expect(sourceUrl).toBe('https://new.dev/r.json');
            expect(blocks).toEqual([header]);
        });

        it('takes a line whose own address is unusable once the field gives a good one', () => {
            const { blocks, sourceUrl } = takeSourceLink([header, context('<javascript:alert(1)|원문 보기>')], {
                url: 'https://x.dev/r.json',
            });
            expect(sourceUrl).toBe('https://x.dev/r.json');
            expect(blocks).toEqual([header]);
        });

        it('gives the link even when the card carries no line for it', () => {
            expect(takeSourceLink([header], { url: 'http://x.dev/r' })).toEqual({
                blocks: [header],
                sourceUrl: 'http://x.dev/r',
            });
        });

        it.each([
            ['javascript:', 'javascript:alert(1)'],
            ['data:', 'data:text/html,<b>x</b>'],
            ['a relative path', 'reports/r.json'],
            ['a number', 42],
        ])('falls back to the line when the field is %s', (_, url) => {
            const { sourceUrl } = takeSourceLink([header, context('<https://x.dev/r.json|원문 보기>')], { url });
            expect(sourceUrl).toBe('https://x.dev/r.json');
        });

        it.each([null, undefined, {}])('reads only the line when source$ is %j', source => {
            const { sourceUrl } = takeSourceLink([header, context('<https://x.dev/r.json|원문 보기>')], source);
            expect(sourceUrl).toBe('https://x.dev/r.json');
        });

        it('gives nothing when neither has a web address', () => {
            const input = [header, context('footer')];
            expect(takeSourceLink(input, { url: 'ftp://x.dev' })).toEqual({ blocks: input });
        });
    });
});

describe('isWebUrl', () => {
    it.each([
        ['https://x.dev', true],
        [' http://x.dev/a ', true],
        ['javascript:alert(1)', false],
        ['mailto:a@x.dev', false],
        ['', false],
        [undefined, false],
        [7, false],
    ])('%j → %s', (url, expected) => {
        expect(isWebUrl(url)).toBe(expected);
    });
});
