import type { BlockTextObject, KnownBlock } from './blockKit';

/**
 * Flatten Block Kit content to plain text for every surface that is not the
 * message body — sidebar preview, OS notification, search match, clipboard. The
 * blocks counterpart of `stripMarkdown`, and the only place that knows how to do
 * it: a surface that reads `chat.content` directly would show raw JSON.
 */

// Slack escapes exactly these three on the wire.
const decodeEntities = (text: string): string =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * A mark only counts when its delimiters stand alone, the way Slack reads them.
 * Without this, `user_id` loses its underscore — and error reports, the messages
 * most likely to arrive as blocks, are full of identifiers.
 */
const unwrap = (mark: string): [RegExp, string] => [
    new RegExp(`(^|[^\\w${mark}])${mark}([^${mark}\\n]+)${mark}(?![\\w${mark}])`, 'g'),
    '$1$2',
];

/**
 * Slack's mrkdwn is not the dialect `RichText` renders — `*x*` is bold here and
 * italic there — so this is deliberately a separate parser. Angle-bracket tokens
 * go first: decoding entities before them would turn an escaped `&lt;` into a
 * link that was never in the message.
 */
export const mrkdwnToPlainText = (text: string): string =>
    decodeEntities(
        text
            .replace(/<[^<>|]+\|([^<>]*)>/g, '$1') // <url|label> → label
            .replace(/<[@!]([^<>|]+)>/g, '@$1') // <@U123>, <!here> → @U123, @here
            .replace(/<([^<>|]+)>/g, '$1') // <url> → url
            .replace(/```([\s\S]*?)```/g, '$1')
            .replace(/`([^`\n]+)`/g, '$1')
            .replace(...unwrap('\\*'))
            .replace(...unwrap('_'))
            .replace(...unwrap('~'))
    );

const textOf = (text: BlockTextObject): string =>
    text.type === 'mrkdwn' ? mrkdwnToPlainText(text.text) : decodeEntities(text.text);

const lineOf = (block: KnownBlock): string => {
    switch (block.type) {
        case 'header':
            return textOf(block.text);
        case 'section':
            return [block.text && textOf(block.text), block.fields?.map(textOf).join(' ')].filter(Boolean).join(' ');
        case 'context':
            return block.elements.map(textOf).join(' ');
        case 'unknown':
            return block.raw;
        default:
            return '';
    }
};

export const blocksToPlainText = (blocks: KnownBlock[]): string => blocks.map(lineOf).filter(Boolean).join('\n');
