import { $isTextNode, type RangeSelection, type TextNode } from 'lexical';

import { MENTION_TOKEN_SOURCE } from '../../../../shared';

const MENTION_MATCH = new RegExp(`(^|[\\s([{])(@(${MENTION_TOKEN_SOURCE}*))$`, 'u');

export interface MentionAtCaret {
    query: string;
    startKey: string;
    startOffset: number;
}

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

    let offset = match.index + match[1].length;
    for (const node of nodes) {
        const len = lengthOf(node);
        if (offset <= len) return { query: match[3], startKey: node.getKey(), startOffset: offset };
        offset -= len;
    }
    return null;
};
