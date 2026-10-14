import { blocksToPlainText, parseBlocks } from '@chatic/block-kit';

import { toPlainPreview, toPlainText } from './messageTokens';

/**
 * A message body as one string, whatever shape it arrived in — a Block Kit payload or
 * ordinary text.
 *
 * Every surface that is not the message body itself reads this: the home list preview,
 * search results, the expanded-message dialog, Copy. Reading `chat.content` there hands the
 * reader raw JSON, and each surface that solves it privately is one more place to forget.
 *
 * Nothing is stripped here: Copy puts what was sent on the clipboard, markup included, and the
 * detail dialog hands this to `MessageText`, which draws the markup. Surfaces that only print
 * text use the flattened forms below instead.
 *
 * The `blocks$` read path needs no branch: when the server fills that field it also puts its
 * own plain-text summary in `content` (SPEC §6-5), and a summary is not JSON, so it falls
 * through unchanged — which is exactly the summary the server promised.
 */
export const messagePlainText = (content?: string): string => {
    const blocks = parseBlocks(content);
    return blocks ? blocksToPlainText(blocks) : (content ?? '');
};

/**
 * A message body for a surface that prints text but cannot draw it — markers dropped, a labelled
 * link read as its words, a fenced block cut to its first line. The room rows (home, manage list,
 * a search result's room row — through `lastChatPreview`) and the delete confirmation all read
 * this, so a message's text flattens the same way wherever it appears.
 */
export const messagePreview = (content?: string): string => toPlainPreview(messagePlainText(content));

/**
 * A message body for a search result: flattened like `messagePreview`, but keeping every line of
 * a fenced block, because the row highlights the query inside it and a match on a code block's
 * later lines must still be there to highlight. The row itself is one line and truncates.
 */
export const messageSearchText = (content?: string): string => toPlainText(messagePlainText(content));

/** How long the delete confirmation quotes a message before cutting it, so the dialog stays one. */
const DELETE_PREVIEW_LENGTH = 60;

/** A one-line quote of the message being deleted, cut short; '' when it has no text to quote. */
export const deleteConfirmQuote = (content?: string): string => {
    const oneLine = messagePreview(content).replace(/\s+/g, ' ').trim();
    return oneLine.length > DELETE_PREVIEW_LENGTH ? `${oneLine.slice(0, DELETE_PREVIEW_LENGTH)}…` : oneLine;
};
