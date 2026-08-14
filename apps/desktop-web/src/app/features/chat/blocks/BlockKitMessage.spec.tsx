import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import { blocksToPlainText, type BlockTextObject, type KnownBlock } from '../../../shared';
import { BlockKitMessage } from './BlockKitMessage';

const draw = (blocks: KnownBlock[], raw = '{"blocks":[]}') => render(<BlockKitMessage blocks={blocks} raw={raw} />);

describe('BlockKitMessage', () => {
    it('draws a header at its heading level', () => {
        draw([{ type: 'header', text: { type: 'plain_text', text: 'Error report' }, level: 2 }]);
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Error report');
    });

    it('defaults a header with no level to h1', () => {
        draw([{ type: 'header', text: { type: 'plain_text', text: 'Report' } }]);
        expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    });

    it('draws a divider as a separator', () => {
        draw([{ type: 'divider' }]);
        expect(screen.getByRole('separator')).toBeDefined();
    });

    it('reads Slack marks, not the composer dialect', () => {
        draw([{ type: 'section', text: { type: 'mrkdwn', text: '*403* and _denied_' } }]);
        expect(screen.getByText('403').tagName).toBe('STRONG');
        expect(screen.getByText('denied').tagName).toBe('EM');
    });

    // The composer writes `**x**` for bold; Slack's parser must not read that as
    // an italic wrapped in stray asterisks.
    it('leaves the composer dialect literal', () => {
        draw([{ type: 'section', text: { type: 'mrkdwn', text: '**not bold**' } }]);
        expect(screen.queryByText('not bold')).toBeNull();
    });

    it('decodes an escape that sits right in front of a mark', () => {
        draw([{ type: 'section', text: { type: 'mrkdwn', text: 'Tom &amp;*Jerry*' } }]);
        expect(screen.getByText('Tom &')).toBeDefined();
        expect(screen.getByText('Jerry').tagName).toBe('STRONG');
    });

    it('renders plain_text literally', () => {
        draw([{ type: 'section', text: { type: 'plain_text', text: '*not a mark*' } }]);
        expect(screen.getByText('*not a mark*')).toBeDefined();
    });

    it('links a labelled url and hides its target from the label', () => {
        draw([{ type: 'section', text: { type: 'mrkdwn', text: '<https://x.dev|the docs>' } }]);
        const link = screen.getByRole('link', { name: 'the docs' });
        expect(link.getAttribute('href')).toBe('https://x.dev');
    });

    it('draws a section with fields', () => {
        draw([
            {
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: 'High' },
                    { type: 'plain_text', text: 'Silly' },
                ],
            },
        ]);
        expect(screen.getByText('High')).toBeDefined();
        expect(screen.getByText('Silly')).toBeDefined();
    });

    // Slack writes a field as "*Label*\nvalue" and newlines are significant in every
    // text object. jsdom has no layout, so the whitespace rule is the only observable
    // — but it is the thing that broke, and nothing else in the block reinstates it.
    it('preserves the line breaks Slack puts inside a text object', () => {
        const { container } = draw([
            { type: 'section', fields: [{ type: 'mrkdwn', text: '*Service*\nchatic-sockets-api' }] },
        ]);
        const field = screen.getByText('Service').closest('.whitespace-pre-wrap');
        expect(field).toBeTruthy();
        expect(container.textContent).toContain('\n');
    });

    // The rendered context line and the flattened one go to different surfaces — the
    // message and the sidebar preview — so they have to agree on the spacing.
    it('separates context elements the same way the flattener does', () => {
        const elements: BlockTextObject[] = [
            { type: 'mrkdwn', text: '*Owner:* platform' },
            { type: 'mrkdwn', text: '· severity S1' },
        ];
        const { container } = draw([{ type: 'context', elements }]);
        expect(container.textContent).toContain('platform · severity');
        expect(blocksToPlainText([{ type: 'context', elements }])).toBe('Owner: platform · severity S1');
    });

    it('names the block type it could not draw, so the JSON does not read as content', () => {
        draw([{ type: 'unknown', raw: '{"type":"actions"}' }, { type: 'divider' }]);
        expect(screen.getByText(/unsupported block · actions/)).toBeDefined();
    });

    it('shows the source of a block it cannot draw, beside the ones it can', () => {
        draw([
            { type: 'section', text: { type: 'mrkdwn', text: 'drawn' } },
            { type: 'unknown', raw: '{"type":"actions"}' },
        ]);
        expect(screen.getByText('drawn')).toBeDefined();
        expect(screen.getByText('{"type":"actions"}')).toBeDefined();
    });

    // A stack of JSON fragments is unreadable. If none of it is drawable, the
    // original message is the better thing to show.
    it('falls back to the whole original message when nothing is drawable', () => {
        draw([{ type: 'unknown', raw: '{"type":"actions"}' }], 'the original **text**');
        expect(screen.queryByText('{"type":"actions"}')).toBeNull();
        expect(screen.getByText('text').tagName).toBe('STRONG');
    });
});
