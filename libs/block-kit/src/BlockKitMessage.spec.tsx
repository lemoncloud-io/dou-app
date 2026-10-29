import { describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import type { BlockTextObject, KnownBlock } from './blockKit';
import { blocksToPlainText } from './blocksToPlainText';
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

    // A caller that knows how to leave its shell takes the press; the anchor must not
    // also follow it, or the mobile WebView loads the target over the app.
    it('hands a pressed link to the caller instead of following it', () => {
        const onLinkClick = vi.fn();
        render(
            <BlockKitMessage
                blocks={[{ type: 'section', text: { type: 'mrkdwn', text: '<https://x.dev|the docs>' } }]}
                raw=""
                onLinkClick={onLinkClick}
            />
        );
        const followed = fireEvent.click(screen.getByRole('link', { name: 'the docs' }));
        expect(followed).toBe(false);
        expect(onLinkClick).toHaveBeenCalledWith('https://x.dev');
    });

    // The builder and desktop have no handler to give, and the anchor's default is
    // right for both: a browser tab, and an Electron window the shell hands to the OS.
    it('leaves the anchor default alone when the caller has no handler', () => {
        draw([{ type: 'section', text: { type: 'mrkdwn', text: '<https://x.dev>' } }]);
        expect(fireEvent.click(screen.getByRole('link', { name: 'https://x.dev' }))).toBe(true);
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
            { type: 'section', fields: [{ type: 'mrkdwn', text: 'chatic-sockets-api\nap-northeast-2' }] },
        ]);
        const field = screen.getByText(/chatic-sockets-api/).closest('.whitespace-pre-wrap');
        expect(field).toBeTruthy();
        expect(container.textContent).toContain('\n');
    });

    // "*Label*\nvalue" is Slack's field shape. The label is a caption over the value,
    // not a bold run, so the two bold lines of a two-field row do not compete with
    // the card's title.
    it('draws a field written as a bold first line as a caption over its value', () => {
        const { container } = draw([
            {
                type: 'section',
                fields: [{ type: 'mrkdwn', text: '*Commit*\n<https://x.dev/c/7b186ab|7b186ab> by octocat' }],
            },
        ]);
        expect(screen.getByText('Commit').tagName).toBe('SPAN');
        expect(container.querySelector('strong')).toBeNull();
        expect(screen.getByRole('link', { name: '7b186ab' }).getAttribute('href')).toBe('https://x.dev/c/7b186ab');
        expect(screen.getByText('Commit').parentElement?.textContent).toBe('Commit7b186ab by octocat');
    });

    it('keeps a bold run that is not a label line as bold', () => {
        draw([{ type: 'section', fields: [{ type: 'mrkdwn', text: '*Commit* 7b186ab' }] }]);
        expect(screen.getByText('Commit').tagName).toBe('STRONG');
    });

    it('does not read a plain_text field as a label and value', () => {
        draw([{ type: 'section', fields: [{ type: 'plain_text', text: '*Commit*\n7b186ab' }] }]);
        expect(screen.getByText(/\*Commit\*/)).toBeDefined();
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

    describe('source link', () => {
        const blocks: KnownBlock[] = [
            { type: 'section', text: { type: 'mrkdwn', text: 'lead' } },
            { type: 'header', text: { type: 'plain_text', text: '503 Service Unavailable' } },
            { type: 'header', text: { type: 'plain_text', text: 'Second' }, level: 2 },
        ];
        const report = 'https://example.com/reports/report.json';

        it('links the first heading to the source, named for a screen reader', () => {
            render(<BlockKitMessage blocks={blocks} raw="" sourceUrl={report} labels={{ openSource: '원문 보기' }} />);
            const link = screen.getByRole('link', { name: /503 Service Unavailable.*원문 보기/ });
            expect(link.getAttribute('href')).toBe(report);
            expect(screen.getByRole('heading', { level: 2 }).closest('a')).toBeNull();
        });

        it('hands the press to the caller instead of following it', () => {
            const onLinkClick = vi.fn();
            render(<BlockKitMessage blocks={blocks} raw="" sourceUrl={report} onLinkClick={onLinkClick} />);
            const link = screen.getByRole('link', { name: /503/ });
            const notPrevented = fireEvent.click(link);
            expect(onLinkClick).toHaveBeenCalledWith(report);
            expect(notPrevented).toBe(false);
        });

        it.each(['javascript:alert(1)', 'data:text/html,x', 'reports/report.json', '  '])(
            'draws no link for %j',
            sourceUrl => {
                render(<BlockKitMessage blocks={blocks} raw="" sourceUrl={sourceUrl} />);
                expect(screen.queryByRole('link')).toBeNull();
            }
        );

        it('does not wrap a mrkdwn heading, whose own links cannot sit inside it', () => {
            const mrkdwnHeader: KnownBlock = {
                type: 'header',
                text: { type: 'mrkdwn', text: 'Deploy <https://x.dev|#42>' },
            };
            render(<BlockKitMessage blocks={[mrkdwnHeader]} raw="" sourceUrl={report} />);
            expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['https://x.dev']);
        });

        it('draws no link when there is no heading to carry it', () => {
            render(<BlockKitMessage blocks={[blocks[0]]} raw="" sourceUrl={report} />);
            expect(screen.queryByRole('link')).toBeNull();
        });
    });

    // The design draws the card twice, a step larger on desktop. Written-out sizes rather than the
    // app's tokens, because the callers size the same token names differently.
    describe('scale', () => {
        const card: KnownBlock[] = [
            { type: 'header', text: { type: 'plain_text', text: 'Title' } },
            { type: 'section', text: { type: 'mrkdwn', text: 'Body' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: 'Footer' }] },
        ];
        const sizeOf = (text: string) =>
            (screen.getByText(text).closest('[class*="rem]"]')?.className ?? '').match(/text-\[[\d.]+rem\]/)?.[0];

        it('draws the phone card by default, at the sizes apps/web shipped', () => {
            draw(card);
            expect([sizeOf('Title'), sizeOf('Body'), sizeOf('Footer')]).toEqual([
                'text-[1rem]',
                'text-[0.875rem]',
                'text-[0.875rem]',
            ]);
        });

        it('draws the desktop card a step larger, keeping the context line at the phone size', () => {
            render(<BlockKitMessage blocks={card} raw="" scale="desktop" />);
            expect([sizeOf('Title'), sizeOf('Body'), sizeOf('Footer')]).toEqual([
                'text-[1.125rem]',
                'text-[1rem]',
                'text-[0.875rem]',
            ]);
        });
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
        draw([{ type: 'unknown', raw: '{"type":"actions"}' }], 'the original text');
        expect(screen.queryByText('{"type":"actions"}')).toBeNull();
        expect(screen.getByText('the original text')).toBeDefined();
    });

    // The lib knows Block Kit, not the app's message dialect, so the fallback body
    // is drawn by whoever supplied it. desktop-web hands over `RichText` — this
    // stands in for it — while the builder's preview takes the literal default above.
    it('draws the fallback body with the renderer the caller supplied', () => {
        render(
            <BlockKitMessage
                blocks={[{ type: 'unknown', raw: '{"type":"actions"}' }]}
                raw="the original **text**"
                renderFallback={raw => <strong>{raw}</strong>}
            />
        );
        expect(screen.getByText('the original **text**').tagName).toBe('STRONG');
    });
});
