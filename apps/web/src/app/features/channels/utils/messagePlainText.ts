import { blocksToPlainText, parseBlocks } from '@chatic/block-kit';

/**
 * A message body as one string, whatever shape it arrived in — a Block Kit payload or
 * ordinary text.
 *
 * Every surface that is not the message body itself reads this: the home list preview,
 * search results, the expanded-message dialog, Copy. Reading `chat.content` there hands the
 * reader raw JSON, and each surface that solves it privately is one more place to forget.
 *
 * Nothing is stripped here — callers that want a single flattened line compose this with
 * `toPlainPreview`, and the ones that want the full body (Copy, the detail dialog) do not.
 *
 * The `blocks$` read path needs no branch: when the server fills that field it also puts its
 * own plain-text summary in `content` (SPEC §6-5), and a summary is not JSON, so it falls
 * through unchanged — which is exactly the summary the server promised.
 */
export const messagePlainText = (content?: string): string => {
    const blocks = parseBlocks(content);
    return blocks ? blocksToPlainText(blocks) : (content ?? '');
};
