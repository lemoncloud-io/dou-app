import type { BlockKind } from '../../store';

/**
 * A block drawn at thumbnail size.
 *
 * The palette used to be five identical `+` icons, which meant the label was the
 * only thing distinguishing one entry from another — and the labels are schema
 * words. A picture of the shape says what `Context` cannot: this one is a small
 * grey line at the bottom.
 */
const SHAPES: Record<BlockKind, JSX.Element> = {
    header: (
        <>
            <rect x="1" y="4" width="10" height="2.5" rx="1" />
            <rect x="1" y="9" width="14" height="1.5" rx="0.75" opacity="0.35" />
        </>
    ),
    section: (
        <>
            <rect x="1" y="3" width="14" height="1.5" rx="0.75" />
            <rect x="1" y="7" width="14" height="1.5" rx="0.75" />
            <rect x="1" y="11" width="9" height="1.5" rx="0.75" />
        </>
    ),
    fields: (
        <>
            <rect x="1" y="3" width="5" height="1.5" rx="0.75" />
            <rect x="9" y="3" width="5" height="1.5" rx="0.75" />
            <rect x="1" y="7" width="6" height="1.5" rx="0.75" opacity="0.45" />
            <rect x="9" y="7" width="6" height="1.5" rx="0.75" opacity="0.45" />
        </>
    ),
    divider: <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" />,
    context: <rect x="1" y="10" width="11" height="1.5" rx="0.75" opacity="0.55" />,
};

export const BlockGlyph = ({ kind }: { kind: BlockKind }) => (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="shrink-0 fill-current">
        {SHAPES[kind]}
    </svg>
);
