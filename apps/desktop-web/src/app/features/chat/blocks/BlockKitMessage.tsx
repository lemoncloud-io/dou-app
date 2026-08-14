import { type ReactNode } from 'react';

import { decodeSlackEntities, type BlockTextObject, type KnownBlock } from '../../../shared';
import { MSG_CODE_BLOCK_CLASS, RichText } from '../components/RichText';
import { renderMrkdwn } from './renderMrkdwn';

const textOf = (text: BlockTextObject): ReactNode =>
    text.type === 'mrkdwn' ? renderMrkdwn(text.text) : decodeSlackEntities(text.text);

const Header = ({ text, level }: { text: BlockTextObject; level?: number }): ReactNode => {
    const Tag = `h${Math.min(Math.max(level ?? 1, 1), 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
    return <Tag className="text-heading font-semibold text-foreground">{textOf(text)}</Tag>;
};

const drawBlock = (block: KnownBlock, key: number): ReactNode => {
    switch (block.type) {
        case 'header':
            return <Header key={key} text={block.text} level={block.level} />;
        case 'divider':
            return <hr key={key} className="border-hairline" />;
        case 'section':
            return (
                <div key={key} className="flex flex-col gap-1">
                    {block.text && <span>{textOf(block.text)}</span>}
                    {block.fields && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {block.fields.map((field, i) => (
                                <span key={i}>{textOf(field)}</span>
                            ))}
                        </div>
                    )}
                </div>
            );
        case 'context':
            return (
                <div key={key} className="text-caption text-muted-foreground">
                    {block.elements.map((element, i) => (
                        <span key={i}>{textOf(element)}</span>
                    ))}
                </div>
            );
        default:
            // Kept verbatim so an unsupported block is visible rather than absent.
            return (
                <span key={key} className={MSG_CODE_BLOCK_CLASS}>
                    {block.raw}
                </span>
            );
    }
};

interface BlockKitMessageProps {
    blocks: KnownBlock[];
    /** The original message body — what to show when none of the blocks can be drawn. */
    raw: string;
    selfNames?: string[];
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
export const BlockKitMessage = ({ blocks, raw, selfNames }: BlockKitMessageProps): ReactNode => {
    if (blocks.every(block => block.type === 'unknown')) {
        return (
            <p className="select-text whitespace-pre-wrap break-words text-body text-foreground">
                <RichText content={raw} selfNames={selfNames} />
            </p>
        );
    }
    return (
        <div className="flex select-text flex-col gap-1.5 break-words text-body text-foreground">
            {blocks.map(drawBlock)}
        </div>
    );
};
