import type { KnownBlock } from '@chatic/block-kit';

export type BlockKind = 'header' | 'section' | 'fields' | 'divider' | 'context';

interface PaletteEntry {
    kind: BlockKind;
    label: string;
    hint: string;
}

export const PALETTE: readonly PaletteEntry[] = [
    { kind: 'header', label: 'Header', hint: 'A heading line. Plain text — marks show literally.' },
    { kind: 'section', label: 'Section', hint: 'A paragraph. Slack mrkdwn: *bold*, _italic_, `code`.' },
    { kind: 'fields', label: 'Fields', hint: 'A two-column label/value grid.' },
    { kind: 'divider', label: 'Divider', hint: 'A horizontal rule.' },
    { kind: 'context', label: 'Context', hint: 'A small grey line — source, version, author.' },
] as const;

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

export const createBlock = (kind: BlockKind): KnownBlock => FACTORY[kind]();

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

export const describeBlock = (block: KnownBlock): string => {
    const kind = blockKindOf(block);
    return kind ? LABELS[kind] : 'Unsupported';
};
