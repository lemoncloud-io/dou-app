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

import { MENTION_TOKEN_SOURCE } from '../../../../shared';
import type { Mentionable } from '../MentionAutocomplete';
import { $isMentionNode } from './MentionNode';
import { findMentionAtCaret } from './mentionAtCaret';

// A typed @-word outside a chip. The token class is the composer's own —
// whatever the list would have matched on.
const TYPED_MENTION = new RegExp(`@(${MENTION_TOKEN_SOURCE}+)`, 'gu');

// A chip's text is a pick, so chips are skipped: only plain text is scanned.
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

/**
 * The roster member an @-word in the draft names without a pick — typed
 * `@name` sends plain text no teammate hears, so the composer warns while it
 * matters. Quiet while the caret is still inside an @-token (the typeahead
 * owns it then) and once the word is picked (chips are not plain text).
 */
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
