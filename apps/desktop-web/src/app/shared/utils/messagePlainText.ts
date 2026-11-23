import { parseBlocks } from '@chatic/block-kit';
import { blocksToPlainText } from '@chatic/block-kit';
import { stripMarkdown } from './stripMarkdown';

export const messagePlainText = (content?: string): string => {
    const blocks = parseBlocks(content);
    return blocks ? blocksToPlainText(blocks) : stripMarkdown(content ?? '');
};
