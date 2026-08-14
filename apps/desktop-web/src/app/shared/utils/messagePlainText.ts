import { parseBlocks } from './blockKit';
import { blocksToPlainText } from './blocksToPlainText';
import { stripMarkdown } from './stripMarkdown';

/**
 * A message body as one plain line, whatever shape it arrived in — Block Kit
 * payload or ordinary text.
 *
 * Every surface that is not the message body itself reads this: sidebar preview,
 * OS notification, search, mention capture. Reading `chat.content` there instead
 * shows the reader raw JSON, and each surface that solves it privately is one
 * more place to forget.
 */
export const messagePlainText = (content?: string, contentType?: string): string => {
    const blocks = parseBlocks(content, contentType);
    return blocks ? blocksToPlainText(blocks) : stripMarkdown(content ?? '');
};
