import { $isTextNode, type RangeSelection, type TextNode } from 'lexical';

import { MENTION_TOKEN_SOURCE } from '../../../../shared';

// Word-start "@" + token chars up to the caret (same class RichText renders).
const MENTION_MATCH = new RegExp(`(^|[\\s([{])(@(${MENTION_TOKEN_SOURCE}*))$`, 'u');

export interface MentionAtCaret {
    /** The text typed after "@". */
    query: string;
    /** Text node + offset where the "@" starts (for replacement). */
    startKey: string;
    startOffset: number;
}

// Single source of truth for "is the caret inside an @-mention, and where does it
// start". Walks back across adjacent simple-text nodes (a mention chip — type
// 'mention', not simple — stops the walk) so detection and replacement always agree,
// and maps the match back to a precise (node, offset) point so replacement never
// relies on character counting (codepoint/grapheme-safe). Returns null when the caret
// is not in an "@query".
export const findMentionAtCaret = (selection: RangeSelection): MentionAtCaret | null => {
    if (!selection.isCollapsed() || selection.anchor.type !== 'text') return null;
    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode) || !anchorNode.isSimpleText()) return null;
    const caretOffset = selection.anchor.offset;

    const nodes: TextNode[] = [anchorNode];
    let prev = anchorNode.getPreviousSibling();
    while ($isTextNode(prev) && prev.isSimpleText()) {
        nodes.unshift(prev);
        prev = prev.getPreviousSibling();
    }
    const lengthOf = (node: TextNode) => (node === anchorNode ? caretOffset : node.getTextContent().length);
    const text = nodes.map(node => node.getTextContent().slice(0, lengthOf(node))).join('');

    const match = MENTION_MATCH.exec(text);
    if (!match) return null;

    // match.index + lead char → absolute offset of "@"; map it back onto a node.
    let offset = match.index + match[1].length;
    for (const node of nodes) {
        const len = lengthOf(node);
        if (offset <= len) return { query: match[3], startKey: node.getKey(), startOffset: offset };
        offset -= len;
    }
    return null;
};
