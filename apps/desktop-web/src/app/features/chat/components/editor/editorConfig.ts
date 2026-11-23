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

export const COMPOSER_TRANSFORMERS: Transformer[] = [CODE, QUOTE, BOLD_STAR, ITALIC_STAR, STRIKETHROUGH, INLINE_CODE];

const WIRE_LINK: TextMatchTransformer = {
    ...LINK,
    importRegExp: new RegExp(LABELLED_LINK_SOURCE),
    regExp: new RegExp(`${LABELLED_LINK_SOURCE}$`),
    export: (node, exportChildren) => {
        if (!$isLinkNode(node) || $isAutoLinkNode(node)) return null;
        return `[${toLabelledLinkWords(exportChildren(node))}](${node.getURL()})`;
    },
};

export const WIRE_TRANSFORMERS: Transformer[] = [...COMPOSER_TRANSFORMERS, WIRE_LINK];

export const COMPOSER_NODES: Klass<LexicalNode>[] = [
    CodeNode,
    CodeHighlightNode,
    QuoteNode,
    MentionNode,
    LinkNode,
    AutoLinkNode,
];

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
