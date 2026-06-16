// code-core (not @lexical/code): same nodes without the eager prismjs grammars
// we never run — the composer does no syntax highlighting.
import { CodeHighlightNode, CodeNode } from '@lexical/code-core';
import { QuoteNode } from '@lexical/rich-text';
import { BOLD_STAR, CODE, INLINE_CODE, ITALIC_STAR, QUOTE, STRIKETHROUGH, type Transformer } from '@lexical/markdown';
import type { Klass, LexicalNode } from 'lexical';

import { MSG_BOLD_CLASS, MSG_CODE_BLOCK_CLASS, MSG_CODE_INLINE_CLASS, MSG_QUOTE_CLASS } from '../RichText';
import { MentionNode } from './MentionNode';

/**
 * Exactly the markdown dialect RichText renders — **bold**, *italic*,
 * ~~strike~~, `code`, fenced blocks, "> " quotes. No headings/lists/links:
 * adding transformers here without a matching renderer would send markup the
 * message view shows raw.
 */
export const COMPOSER_TRANSFORMERS: Transformer[] = [CODE, QUOTE, BOLD_STAR, ITALIC_STAR, STRIKETHROUGH, INLINE_CODE];

export const COMPOSER_NODES: Klass<LexicalNode>[] = [CodeNode, CodeHighlightNode, QuoteNode, MentionNode];

// RichText's own classes, so what you type is what readers see.
export const COMPOSER_THEME = {
    paragraph: 'm-0',
    quote: MSG_QUOTE_CLASS,
    code: MSG_CODE_BLOCK_CLASS,
    text: {
        bold: MSG_BOLD_CLASS,
        italic: 'italic',
        strikethrough: 'line-through',
        code: MSG_CODE_INLINE_CLASS,
    },
};
