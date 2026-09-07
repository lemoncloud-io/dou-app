import type { ContextBlock, DividerBlock, HeaderBlock, KnownBlock, SectionBlock } from '@chatic/block-kit';

/**
 * The block kinds the palette offers.
 *
 * Four, not the ten the design mocks list. `Tag`, `Button`, `Image` and `Icon`
 * have no block behind them: the server folds an attachment's colour into an
 * emoji rather than a chip, there is no endpoint for a button press to reach,
 * and images are outside the server's scope (knowledge#319 SPEC §3.3, E7). A
 * palette entry that produced something a channel cannot draw would make the
 * preview a promise the product does not keep.
 *
 * `Title`, `Text` and `Description` collapse into `section` for the same reason —
 * they are the same block with different text, and offering three names for one
 * shape teaches a distinction the payload does not have.
 */
export type BlockKind = 'header' | 'section' | 'fields' | 'divider' | 'context';

export interface PaletteEntry {
    kind: BlockKind;
    label: string;
    /** What this draws, in the reader's terms rather than the schema's. */
    hint: string;
}

export const PALETTE: readonly PaletteEntry[] = [
    { kind: 'header', label: 'Header', hint: 'A heading line. Plain text — marks show literally.' },
    { kind: 'section', label: 'Section', hint: 'A paragraph. Slack mrkdwn: *bold*, _italic_, `code`.' },
    { kind: 'fields', label: 'Fields', hint: 'A two-column label/value grid.' },
    { kind: 'divider', label: 'Divider', hint: 'A horizontal rule.' },
    { kind: 'context', label: 'Context', hint: 'A small grey line — source, version, author.' },
] as const;

const header = (): HeaderBlock => ({ type: 'header', text: { type: 'plain_text', text: 'Heading' } });
const section = (): SectionBlock => ({ type: 'section', text: { type: 'mrkdwn', text: 'Some *text*.' } });
const fields = (): SectionBlock => ({
    type: 'section',
    fields: [
        { type: 'mrkdwn', text: '*Service*\napi' },
        { type: 'mrkdwn', text: '*Stage*\nproduction' },
    ],
});
const divider = (): DividerBlock => ({ type: 'divider' });
const context = (): ContextBlock => ({ type: 'context', elements: [{ type: 'mrkdwn', text: 'context' }] });

/** A new block of the chosen kind, filled in so the preview shows something at once. */
export const createBlock = (kind: BlockKind): KnownBlock => {
    switch (kind) {
        case 'header':
            return header();
        case 'section':
            return section();
        case 'fields':
            return fields();
        case 'divider':
            return divider();
        case 'context':
            return context();
    }
};

/** What to call a block already in the list. `fields` and `section` share a type. */
export const describeBlock = (block: KnownBlock): string => {
    switch (block.type) {
        case 'header':
            return 'Header';
        case 'section':
            return block.fields?.length ? 'Fields' : 'Section';
        case 'divider':
            return 'Divider';
        case 'context':
            return 'Context';
        default:
            return 'Unsupported';
    }
};
