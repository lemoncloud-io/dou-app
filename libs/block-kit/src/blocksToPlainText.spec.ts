import { describe, expect, it } from 'vitest';

import type { KnownBlock } from './blockKit';
import { blocksToPlainText, mrkdwnToPlainText } from './blocksToPlainText';

describe('mrkdwnToPlainText', () => {
    it('drops Slack inline markers', () => {
        expect(mrkdwnToPlainText('a *bold* and _italic_ and ~gone~ and `code`')).toBe(
            'a bold and italic and gone and code'
        );
    });

    // Error reports are full of snake_case, and an underscore inside a word is not a
    // Slack mark — Slack needs the delimiters to stand alone.
    it('leaves identifiers alone', () => {
        expect(mrkdwnToPlainText('user_id and not_found')).toBe('user_id and not_found');
        expect(mrkdwnToPlainText('a_b_c')).toBe('a_b_c');
        expect(mrkdwnToPlainText('doPostRefresh(oauth/f14_81_83a)')).toBe('doPostRefresh(oauth/f14_81_83a)');
    });

    it('still reads a mark that does stand alone, next to one that does not', () => {
        expect(mrkdwnToPlainText('*403* on user_id')).toBe('403 on user_id');
    });

    it('keeps the label of a labelled link, and the url of a bare one', () => {
        expect(mrkdwnToPlainText('see <https://x.dev|the docs>')).toBe('see the docs');
        expect(mrkdwnToPlainText('see <https://x.dev>')).toBe('see https://x.dev');
    });

    it('reads mentions the way Slack writes them', () => {
        expect(mrkdwnToPlainText('<@U123> ping <!here>')).toBe('@U123 ping @here');
    });

    // Slack escapes these three on the wire; leaving them encoded shows the entity to the reader.
    it('decodes the escaped characters', () => {
        expect(mrkdwnToPlainText('a &lt;b&gt; &amp; c')).toBe('a <b> & c');
    });

    // Decoding must happen after link parsing, or an escaped angle bracket becomes a fake link.
    it('does not turn an escaped bracket into a link', () => {
        expect(mrkdwnToPlainText('&lt;https://x.dev|not a link&gt;')).toBe('<https://x.dev|not a link>');
    });
});

describe('blocksToPlainText', () => {
    const blocks: KnownBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: 'Error report' } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: 'High' },
                { type: 'plain_text', text: 'Silly' },
            ],
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '<@U123>' }] },
    ];

    it('reads the blocks in order, one line each', () => {
        expect(blocksToPlainText(blocks)).toBe('Error report\n403 denied by policy\nHigh Silly\n@U123');
    });

    // These surfaces are one line. JSON standing beside real text is noise there,
    // even though the message body shows it — that is where there is room to say so.
    it('drops an unreadable block when the message says anything else', () => {
        expect(blocksToPlainText([...blocks, { type: 'unknown', raw: '{"type":"actions"}' }])).not.toContain('actions');
    });

    it('falls back to the raw source when nothing else has text', () => {
        expect(blocksToPlainText([{ type: 'unknown', raw: '{"type":"actions"}' }])).toBe('{"type":"actions"}');
    });

    it('is empty for blocks that carry no text', () => {
        expect(blocksToPlainText([{ type: 'divider' }])).toBe('');
    });
});
