import { SLACK_MARKS, decodeSlackEntities, markPattern, type BlockTextObject, type KnownBlock } from './blockKit';

const MARKS = SLACK_MARKS.map(mark => new RegExp(markPattern(mark), 'g'));

export const mrkdwnToPlainText = (text: string): string => {
    const tokensGone = text
        .replace(/<[^<>|]+\|([^<>]*)>/g, '$1')
        .replace(/<[@!]([^<>|]+)>/g, '@$1')
        .replace(/<([^<>|]+)>/g, '$1')
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

export const blocksToPlainText = (blocks: KnownBlock[]): string => {
    const drawn = blocks.map(lineOf).filter(Boolean);
    if (drawn.length) return drawn.join('\n');
    return blocks.flatMap(block => (block.type === 'unknown' ? [block.raw] : [])).join('\n');
};
