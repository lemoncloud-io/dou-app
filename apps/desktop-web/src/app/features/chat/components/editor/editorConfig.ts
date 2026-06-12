import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { QuoteNode } from '@lexical/rich-text';
import { BOLD_STAR, CODE, INLINE_CODE, ITALIC_STAR, QUOTE, STRIKETHROUGH, type Transformer } from '@lexical/markdown';
import type { Klass, LexicalNode } from 'lexical';

import { MentionNode } from './MentionNode';

/**
 * Exactly the markdown dialect RichText renders — **bold**, *italic*,
 * ~~strike~~, `code`, fenced blocks, "> " quotes. No headings/lists/links:
 * adding transformers here without a matching renderer would send markup the
 * message view shows raw.
 */
export const COMPOSER_TRANSFORMERS: Transformer[] = [CODE, QUOTE, BOLD_STAR, ITALIC_STAR, STRIKETHROUGH, INLINE_CODE];

export const COMPOSER_NODES: Klass<LexicalNode>[] = [CodeNode, CodeHighlightNode, QuoteNode, MentionNode];

// Mirrors the RichText message styles so what you type is what readers see.
export const COMPOSER_THEME = {
    paragraph: 'm-0',
    quote: 'my-0.5 block border-l-2 border-primary/40 pl-2 text-muted-foreground',
    code: 'my-1 block overflow-x-auto rounded-md border border-hairline bg-well p-2 font-mono text-[0.85em] leading-relaxed',
    text: {
        bold: 'font-semibold',
        italic: 'italic',
        strikethrough: 'line-through',
        code: 'rounded bg-well px-1 py-0.5 font-mono text-[0.85em]',
    },
};
