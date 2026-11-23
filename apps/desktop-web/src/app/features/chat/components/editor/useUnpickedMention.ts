import { useEffect, useRef, useState } from 'react';

import {
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    $isTextNode,
    type LexicalEditor,
    type LexicalNode,
} from 'lexical';

import { MENTION_TOKEN_SOURCE, isMentionBoundary } from '../../../../shared';
import type { Mentionable } from '../MentionAutocomplete';
import { $isMentionNode } from './MentionNode';
import { findMentionAtCaret } from './mentionAtCaret';

const TYPED_MENTION = new RegExp(`@(${MENTION_TOKEN_SOURCE}+)`, 'gu');

const collectPlainTexts = (node: LexicalNode, out: string[]): void => {
    if ($isMentionNode(node)) return;
    if ($isTextNode(node)) {
        out.push(node.getTextContent());
        return;
    }
    if ($isElementNode(node)) {
        for (const child of node.getChildren()) collectPlainTexts(child, out);
    }
};

export const useUnpickedMention = (editor: LexicalEditor, mentionables: Mentionable[]): Mentionable | null => {
    const [match, setMatch] = useState<Mentionable | null>(null);
    const rosterRef = useRef(mentionables);
    rosterRef.current = mentionables;

    useEffect(
        () =>
            editor.registerUpdateListener(({ editorState }) => {
                const found = editorState.read(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection) && findMentionAtCaret(selection)) return null;
                    const texts: string[] = [];
                    collectPlainTexts($getRoot(), texts);
                    const roster = rosterRef.current;
                    for (const text of texts) {
                        TYPED_MENTION.lastIndex = 0;
                        let token: RegExpExecArray | null;
                        while ((token = TYPED_MENTION.exec(text)) !== null) {
                            if (!isMentionBoundary(text, token.index)) continue;
                            const lower = token[1].toLowerCase();
                            const hit = roster.find(m =>
                                m.everyone
                                    ? [m.name, ...(m.keywords ?? [])].some(word => word.toLowerCase() === lower)
                                    : m.name.toLowerCase() === lower
                            );
                            if (hit) return hit;
                        }
                    }
                    return null;
                });
                setMatch(found);
            }),
        [editor]
    );

    return match;
};
