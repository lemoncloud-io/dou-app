import { SLACK_MARKS, decodeSlackEntities, markPattern, type BlockTextObject, type KnownBlock } from './blockKit';

/**
 * Flatten Block Kit content to plain text for every surface that is not the
 * message body — sidebar preview, OS notification, search match, clipboard. The
 * blocks counterpart of `stripMarkdown`, and the only place that knows how to do
 * it: a surface that reads `chat.content` directly would show raw JSON.
 */

// Compiled once at module load, not per message: this runs over every cached row
// of a search, and `markPattern` is the same grammar the renderer folds into its
// own matcher.
const MARKS = SLACK_MARKS.map(mark => new RegExp(markPattern(mark), 'g'));

/**
 * Slack's mrkdwn is not the dialect `RichText` renders — `*x*` is bold here and
 * italic there — so this is deliberately a separate parser. Angle-bracket tokens
 * go first: decoding entities before them would turn an escaped `&lt;` into a
 * link that was never in the message.
 */
export const mrkdwnToPlainText = (text: string): string => {
    const tokensGone = text
        .replace(/<[^<>|]+\|([^<>]*)>/g, '$1') // <url|label> → label
        .replace(/<[@!]([^<>|]+)>/g, '@$1') // <@U123>, <!here> → @U123, @here
        .replace(/<([^<>|]+)>/g, '$1') // <url> → url
        .replace(/```([\s\S]*?)```/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1');
    return decodeSlackEntities(MARKS.reduce((acc, mark) => acc.replace(mark, '$1$2'), tokensGone));
};

const textOf = (text: BlockTextObject): string =>
    text.type === 'mrkdwn' ? mrkdwnToPlainText(text.text) : decodeSlackEntities(text.text);

const lineOf = (block: KnownBlock): string => {
    switch (block.type) {
        case 'header':
            return textOf(block.text);
        case 'section':
            return [block.text && textOf(block.text), block.fields?.map(textOf).join(' ')].filter(Boolean).join(' ');
        case 'context':
            return block.elements.map(textOf).join(' ');
        default:
            return '';
    }
};

/**
 * The same two-tier rule the renderer uses, one dimension down. A block we could
 * not draw shows its source *in the message*, where there is room to say so — but
 * these surfaces are one line, and JSON pasted into a sidebar preview or a delete
 * confirmation is noise standing in for the thing the reader is trying to
 * identify. So unknown blocks are dropped while anything else has text, and only
 * carry their source when nothing else does.
 */
export const blocksToPlainText = (blocks: KnownBlock[]): string => {
    const drawn = blocks.map(lineOf).filter(Boolean);
    if (drawn.length) return drawn.join('\n');
    return blocks.flatMap(block => (block.type === 'unknown' ? [block.raw] : [])).join('\n');
};
