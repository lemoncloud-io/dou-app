import { useContext, type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import {
    BlockKitLabelsContext,
    DEFAULT_BLOCK_KIT_LABELS,
    useBlockKitLabels,
    type BlockKitLabels,
} from './blockKitLabels';
import { decodeSlackEntities, hasDrawableBlocks, type BlockTextObject, type KnownBlock } from './blockKit';
import { MSG_CODE_BLOCK_CLASS } from './messageClasses';
import { BlockKitLinkContext, renderMrkdwn } from './renderMrkdwn';
import { isWebUrl, linkableHeaderIndex } from './sourceLink';

// Newlines are significant in every Slack text object — a field is routinely
// "*Label*\nvalue" — and nothing else in the block reinstates them.
const TEXT_FLOW = 'whitespace-pre-wrap';

const textOf = (text: BlockTextObject): ReactNode =>
    text.type === 'mrkdwn' ? renderMrkdwn(text.text) : decodeSlackEntities(text.text);

// The heading is the only line in the card that speaks at full ink; everything under
// it is the same quieter secondary text, so the title is found first. h1 is the
// app's body size made bold rather than a step up the scale: it sits under an author
// line that already carries weight, and in a phone-width card a larger heading wraps
// a one-line error name onto two.
const HEADING_CLASS = [
    'text-body font-semibold',
    'text-body font-semibold',
    'text-callout font-semibold',
    'text-callout font-semibold',
];

// Body text of a section, a field value, and the stack under an error all read in
// the label grey, not the foreground: the card's title is the message, the rest is
// what supports it.
const BODY_CLASS = 'text-caption font-medium text-label';

const Header = ({ text, level, sourceUrl }: { text: BlockTextObject; level?: number; sourceUrl?: string }) => {
    const onLinkClick = useContext(BlockKitLinkContext);
    const labels = useBlockKitLabels();
    const depth = Math.min(Math.max(level ?? 1, 1), 4);
    const Tag = `h${depth}` as 'h1' | 'h2' | 'h3' | 'h4';
    const heading = <Tag className={cn('text-foreground', TEXT_FLOW, HEADING_CLASS[depth - 1])}>{textOf(text)}</Tag>;
    if (!sourceUrl) return heading;
    // The title itself is the link, drawn as the title: a webhook card's heading names
    // the event, and the event's full report is what a reader pressing it wants. No
    // icon beside it — every card from a sender that attaches its source would carry
    // the same mark, which says nothing once it is on all of them. An underline on
    // hover tells a pointer it is a link; a screen reader hears it from the hidden label.
    return (
        <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="focus-ring block w-fit max-w-full rounded underline-offset-2 hover:underline"
            onClick={
                onLinkClick &&
                (event => {
                    event.preventDefault();
                    onLinkClick(sourceUrl);
                })
            }
        >
            {heading}
            <span className="sr-only">{labels.openSource}</span>
        </a>
    );
};

// Slack's convention for a field is "*Label*\nvalue" — bold first line, value under
// it. Read that shape as what it means, a small caption over its value, rather than
// as a bold line followed by a plain one: in a two-column grid, two bold lines side
// by side compete with the card's own title. Anything else stays one text object.
const FIELD_LABEL = /^\*([^*\n]+)\*\n/;
const FIELD_FIT = 'min-w-0 max-w-full [overflow-wrap:anywhere]';

const Field = ({ field }: { field: BlockTextObject }): ReactNode => {
    const label = field.type === 'mrkdwn' ? FIELD_LABEL.exec(field.text) : null;
    // `min-w-0` and `overflow-wrap: anywhere`: a flex item will not shrink below its
    // longest word, so a long hash or URL in a value would push past the card's edge.
    if (!label) return <span className={cn(BODY_CLASS, FIELD_FIT)}>{textOf(field)}</span>;
    return (
        <span className={cn('flex flex-col gap-0.5', FIELD_FIT)}>
            <span className="text-xs font-semibold text-description">{decodeSlackEntities(label[1])}</span>
            <span className={BODY_CLASS}>{renderMrkdwn(field.text.slice(label[0].length))}</span>
        </span>
    );
};

const drawBlock = (block: KnownBlock, key: number, sourceUrl?: string): ReactNode => {
    switch (block.type) {
        case 'header':
            return <Header key={key} text={block.text} level={block.level} sourceUrl={sourceUrl} />;
        case 'divider':
            // Capped rather than full-bleed: in a wide pane the card can stretch, and a
            // rule that runs its whole width reads as a separator between messages.
            return <hr key={key} className="max-w-2xl border-hairline" />;
        case 'section':
            return (
                <div key={key} className="flex flex-col gap-2">
                    {block.text && <span className={cn(BODY_CLASS, TEXT_FLOW)}>{textOf(block.text)}</span>}
                    {/* Columns as wide as their content, wrapping when the card runs
                        out of room — a phone card fits two short fields side by side,
                        which a fixed two-column grid only allowed from `sm` up. Capped,
                        because fields spread across a maximised window put the label
                        and its value a screen apart. */}
                    {block.fields && (
                        <div className={cn('flex max-w-2xl flex-wrap gap-x-12 gap-y-2', TEXT_FLOW)}>
                            {block.fields.map((field, i) => (
                                <Field key={i} field={field} />
                            ))}
                        </div>
                    )}
                </div>
            );
        case 'context':
            // A space between elements, not a gap: `blocksToPlainText` joins them with
            // one, and a context line that reads differently in the sidebar preview than
            // in the message is the same value disagreeing with itself.
            return (
                <div key={key} className={cn('text-caption font-medium text-description', TEXT_FLOW)}>
                    {block.elements.map((element, i) => (
                        <span key={i}>
                            {i > 0 && ' '}
                            {textOf(element)}
                        </span>
                    ))}
                </div>
            );
        default:
            // Kept verbatim so an unsupported block is visible rather than absent —
            // labelled, because unannounced JSON in the middle of a message reads as
            // something the sender wrote rather than something we could not draw.
            return (
                <div key={key} className="flex max-w-2xl flex-col gap-1">
                    <span className="text-overline uppercase text-muted-foreground">
                        {`unsupported block · ${block.raw.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ?? 'unknown'}`}
                    </span>
                    <span className={cn(MSG_CODE_BLOCK_CLASS, 'my-0 text-muted-foreground')}>{block.raw}</span>
                </div>
            );
    }
};

interface BlockKitMessageProps {
    blocks: KnownBlock[];
    /** The original message body — what to show when none of the blocks can be drawn. */
    raw: string;
    /**
     * How to draw `raw` when nothing is drawable.
     *
     * A prop rather than an import because the two callers disagree about what a
     * message body means. desktop-web passes its `RichText`, which reads the
     * composer's markdown dialect and highlights the reader's own mentions —
     * neither of which the builder has, and neither of which belongs in a lib
     * that only knows Block Kit. Absent, the body renders as literal text, which
     * is what a preview wants.
     */
    renderFallback?: (raw: string) => ReactNode;
    /** The caller's translation of the renderer's own words; see `BlockKitLabels`. Missing ones read in English. */
    labels?: Partial<BlockKitLabels>;
    /**
     * Opens a link in place of the anchor's default; see `BlockKitLinkContext`.
     * Absent, a link behaves as a plain `target="_blank"` anchor.
     */
    onLinkClick?: (url: string) => void;
    /**
     * Where the whole message can be read in full — a webhook's report, say. The
     * first heading becomes a link to it. Not a block: Slack's
     * `header` carries no URL, so the caller takes it from wherever its message keeps
     * one. Ignored unless it is `http(s)`, and when the first heading is not plain text
     * (a mrkdwn heading can hold links of its own, which cannot sit inside this one).
     */
    sourceUrl?: string;
}

/**
 * A structured message the server sent as Block Kit.
 *
 * Failure has two shapes and they render differently. One unsupported block
 * among drawable ones shows its own source in place, which keeps the rest of the
 * message readable. But a message where *nothing* is drawable would come out as
 * a stack of JSON fragments, so it falls back to the original body instead —
 * one unreadable thing beats several.
 */
export const BlockKitMessage = ({
    blocks,
    raw,
    renderFallback,
    labels,
    onLinkClick,
    sourceUrl,
}: BlockKitMessageProps): ReactNode => {
    if (!hasDrawableBlocks(blocks)) {
        return (
            <p className={cn('select-text break-words text-body text-foreground', TEXT_FLOW)}>
                {renderFallback ? renderFallback(raw) : raw}
            </p>
        );
    }
    const linkedHeader = isWebUrl(sourceUrl) ? linkableHeaderIndex(blocks) : -1;
    return (
        <BlockKitLabelsContext.Provider value={{ ...DEFAULT_BLOCK_KIT_LABELS, ...labels }}>
            <BlockKitLinkContext.Provider value={onLinkClick}>
                <div className="flex select-text flex-col gap-3.5 break-words text-body text-foreground">
                    {blocks.map((block, i) => drawBlock(block, i, i === linkedHeader ? sourceUrl?.trim() : undefined))}
                </div>
            </BlockKitLinkContext.Provider>
        </BlockKitLabelsContext.Provider>
    );
};
