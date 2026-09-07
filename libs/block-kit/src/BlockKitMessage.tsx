import { type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { decodeSlackEntities, hasDrawableBlocks, type BlockTextObject, type KnownBlock } from './blockKit';
import { MSG_CODE_BLOCK_CLASS } from './messageClasses';
import { renderMrkdwn } from './renderMrkdwn';

// Newlines are significant in every Slack text object — a field is routinely
// "*Label*\nvalue" — and nothing else in the block reinstates them.
const TEXT_FLOW = 'whitespace-pre-wrap';

const textOf = (text: BlockTextObject): ReactNode =>
    text.type === 'mrkdwn' ? renderMrkdwn(text.text) : decodeSlackEntities(text.text);

// h1 is a message heading, not a page heading: it sits under an author line that
// already carries more weight, so the scale starts one step below the app's.
const HEADING_CLASS = ['text-title', 'text-heading', 'text-heading', 'text-callout font-semibold'];

const Header = ({ text, level }: { text: BlockTextObject; level?: number }): ReactNode => {
    const depth = Math.min(Math.max(level ?? 1, 1), 4);
    const Tag = `h${depth}` as 'h1' | 'h2' | 'h3' | 'h4';
    return <Tag className={cn('text-foreground', TEXT_FLOW, HEADING_CLASS[depth - 1])}>{textOf(text)}</Tag>;
};

const drawBlock = (block: KnownBlock, key: number): ReactNode => {
    switch (block.type) {
        case 'header':
            return <Header key={key} text={block.text} level={block.level} />;
        case 'divider':
            // Inset rather than full-bleed: a rule that runs the width of the pane
            // reads as a separator between messages, not inside one.
            return <hr key={key} className="my-0.5 max-w-2xl border-hairline" />;
        case 'section':
            return (
                <div key={key} className="flex flex-col gap-2">
                    {block.text && <span className={TEXT_FLOW}>{textOf(block.text)}</span>}
                    {/* Two columns, but only once there is room for them, and never
                        wider than a readable measure — fields spread across a maximised
                        window put the label and its value a screen apart. */}
                    {block.fields && (
                        <div className={cn('grid max-w-2xl gap-x-8 gap-y-2 sm:grid-cols-2', TEXT_FLOW)}>
                            {block.fields.map((field, i) => (
                                <span key={i}>{textOf(field)}</span>
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
                <div key={key} className={cn('text-caption text-muted-foreground', TEXT_FLOW)}>
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
export const BlockKitMessage = ({ blocks, raw, renderFallback }: BlockKitMessageProps): ReactNode => {
    if (!hasDrawableBlocks(blocks)) {
        return (
            <p className={cn('select-text break-words text-body text-foreground', TEXT_FLOW)}>
                {renderFallback ? renderFallback(raw) : raw}
            </p>
        );
    }
    return (
        <div className="flex select-text flex-col gap-2 break-words text-body text-foreground">
            {blocks.map(drawBlock)}
        </div>
    );
};
