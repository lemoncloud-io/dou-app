// code-core (not @lexical/code): same nodes without the eager prismjs grammars
// we never run — the composer does no syntax highlighting.
import { CodeHighlightNode, CodeNode } from '@lexical/code-core';
import { $isAutoLinkNode, $isLinkNode, AutoLinkNode, LinkNode } from '@lexical/link';
import { QuoteNode } from '@lexical/rich-text';
import {
    BOLD_STAR,
    CODE,
    INLINE_CODE,
    ITALIC_STAR,
    LINK,
    QUOTE,
    STRIKETHROUGH,
    type TextMatchTransformer,
    type Transformer,
} from '@lexical/markdown';
import type { Klass, LexicalNode } from 'lexical';

import { MSG_BOLD_CLASS, MSG_CODE_BLOCK_CLASS, MSG_CODE_INLINE_CLASS, MSG_QUOTE_CLASS } from '@chatic/block-kit';
import { LABELLED_LINK_SOURCE, toLabelledLinkWords } from '../../../../shared';
import { MentionNode } from './MentionNode';

/**
 * The markdown typing shortcuts — **bold**, *italic*, ~~strike~~, `code`, fenced
 * blocks, "> " quotes. No headings/lists: adding transformers here without a
 * matching renderer would send markup the message view shows raw.
 */
export const COMPOSER_TRANSFORMERS: Transformer[] = [CODE, QUOTE, BOLD_STAR, ITALIC_STAR, STRIKETHROUGH, INLINE_CODE];

/**
 * Lexical's link transformer held to the rule readers draw by. Reading a message, only
 * `[words](address)` that RichText would link becomes a link — Lexical's own pattern
 * also takes `[x] done [y](…)` as one link and any address at all. Writing, brackets
 * typed into the words become parentheses, which would otherwise end the words early.
 */
const WIRE_LINK: TextMatchTransformer = {
    ...LINK,
    importRegExp: new RegExp(LABELLED_LINK_SOURCE),
    regExp: new RegExp(`${LABELLED_LINK_SOURCE}$`),
    export: (node, exportChildren) => {
        if (!$isLinkNode(node) || $isAutoLinkNode(node)) return null;
        return `[${toLabelledLinkWords(exportChildren(node))}](${node.getURL()})`;
    },
};

/**
 * Exactly the dialect RichText renders: the shortcuts plus `[words](address)` links.
 * Links are read and written but not a typing shortcut — they come from the link
 * dialog, as in Slack.
 */
export const WIRE_TRANSFORMERS: Transformer[] = [...COMPOSER_TRANSFORMERS, WIRE_LINK];

// LinkNode is a labelled link and exports as `[words](address)`. AutoLinkNode is
// display-only: export writes its text back out as the bare URL, which is exactly
// what RichText links on the reader's side.
export const COMPOSER_NODES: Klass<LexicalNode>[] = [
    CodeNode,
    CodeHighlightNode,
    QuoteNode,
    MentionNode,
    LinkNode,
    AutoLinkNode,
];

// RichText's own classes, so what you type is what readers see.
export const COMPOSER_THEME = {
    paragraph: 'm-0',
    quote: MSG_QUOTE_CLASS,
    code: MSG_CODE_BLOCK_CLASS,
    link: 'composer-link',
    text: {
        bold: MSG_BOLD_CLASS,
        italic: 'italic',
        strikethrough: 'line-through',
        code: MSG_CODE_INLINE_CLASS,
    },
};
