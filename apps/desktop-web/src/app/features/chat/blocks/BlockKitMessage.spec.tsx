import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { KnownBlock } from '../../../shared';
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
