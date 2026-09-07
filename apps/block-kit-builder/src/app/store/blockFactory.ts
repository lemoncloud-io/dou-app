import type { KnownBlock } from '@chatic/block-kit';

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

interface PaletteEntry {
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

/**
 * What each kind starts as. A record rather than a switch so adding a kind to
 * `BlockKind` fails to compile until it has a shape here.
 */
const FACTORY: Record<BlockKind, () => KnownBlock> = {
    header: () => ({ type: 'header', text: { type: 'plain_text', text: 'Heading' } }),
    section: () => ({ type: 'section', text: { type: 'mrkdwn', text: 'Some *text*.' } }),
    fields: () => ({
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*Service*\napi' },
            { type: 'mrkdwn', text: '*Stage*\nproduction' },
        ],
    }),
    divider: () => ({ type: 'divider' }),
    context: () => ({ type: 'context', elements: [{ type: 'mrkdwn', text: 'context' }] }),
};

/** A new block of the chosen kind, filled in so the preview shows something at once. */
export const createBlock = (kind: BlockKind): KnownBlock => FACTORY[kind]();

/**
 * Which palette entry a block in the list came from, or null for one the payload
 * editor introduced that the renderer cannot draw. `fields` and `section` share a
 * block type, so the distinction is the presence of `fields` rather than `type`.
 */
export const blockKindOf = (block: KnownBlock): BlockKind | null => {
    switch (block.type) {
        case 'header':
            return 'header';
        case 'section':
            return block.fields?.length ? 'fields' : 'section';
        case 'divider':
            return 'divider';
        case 'context':
            return 'context';
        default:
            return null;
    }
};

const LABELS: Record<BlockKind, string> = Object.fromEntries(PALETTE.map(entry => [entry.kind, entry.label])) as Record<
    BlockKind,
    string
>;

/** What to call a block already in the list. */
export const describeBlock = (block: KnownBlock): string => {
    const kind = blockKindOf(block);
    return kind ? LABELS[kind] : 'Unsupported';
};
