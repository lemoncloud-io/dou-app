import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $createTextNode,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_CRITICAL,
    KEY_ENTER_COMMAND,
    KEY_TAB_COMMAND,
    type RangeSelection,
} from 'lexical';

import { MENTION_TOKEN_SOURCE } from '../../../../shared';
import { MentionAutocomplete, type Mentionable } from '../MentionAutocomplete';
import { $createMentionNode } from './MentionNode';

interface MentionMatch {
    leadOffset: number;
    matchingString: string;
    replaceableString: string;
}

// Word-start "@" + token chars up to the caret (same class RichText renders).
const MENTION_MATCH = new RegExp(`(^|[\\s([{])(@(${MENTION_TOKEN_SOURCE}*))$`, 'u');

const checkForMentionMatch = (text: string): MentionMatch | null => {
    const match = MENTION_MATCH.exec(text);
    if (!match) return null;
    return {
        leadOffset: match.index + match[1].length,
        matchingString: match[3],
        replaceableString: match[2],
    };
};

// Re-derive the active "@query" span from the live caret — walking back across any
// adjacent simple-text nodes (a prior mention chip stops the walk) — and delete
// exactly it. Reading the live model means the result is always current, even right
// after an IME composition commits. Returns false when no "@query" precedes the caret.
const deleteMentionQuery = (selection: RangeSelection): boolean => {
    if (!selection.isCollapsed()) return false;
    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return false;
    let text = anchorNode.getTextContent().slice(0, selection.anchor.offset);
    let prev = anchorNode.getPreviousSibling();
    while ($isTextNode(prev) && prev.isSimpleText()) {
        text = prev.getTextContent() + text;
        prev = prev.getPreviousSibling();
    }
    const match = checkForMentionMatch(text);
    if (!match) return false;
    for (let i = 0; i < match.replaceableString.length; i += 1) selection.deleteCharacter(true);
    return true;
};

interface MentionsPluginProps {
    mentionables: Mentionable[];
}

/**
 * Self-contained "@"-typeahead. We do NOT use @lexical/react's
 * LexicalTypeaheadMenuPlugin: it suspends both its query update and its Enter
 * handling during IME composition (it bails on editor.isComposing(), and Lexical's
 * onKeyDown ignores keys while composing), which breaks Korean/CJK mentions
 * end-to-end — the list won't filter on the first syllable, the selection splits at
 * a stale offset (stray "@"), and Enter needs two presses. Instead we:
 *   1. track the active "@query" from EVERY editor update (composition included),
 *   2. drive keyboard nav from a native capture-phase keydown listener that fires
 *      before Lexical and even mid-composition,
 *   3. replace the span ourselves from the live caret — no stale offsets.
 */
export const MentionsPlugin = ({ mentionables }: MentionsPluginProps) => {
    const [editor] = useLexicalComposerContext();
    const [query, setQuery] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const items = useMemo(() => {
        if (query === null || !mentionables.length) return [];
        const q = query.toLowerCase();
        return q ? mentionables.filter(m => m.name.toLowerCase().includes(q)) : mentionables;
    }, [query, mentionables]);
    const open = items.length > 0;
    const clampedIndex = Math.min(activeIndex, items.length - 1);

    // Refs mirror the latest render state so the native handlers (registered once)
    // never read a stale closure.
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const indexRef = useRef(clampedIndex);
    indexRef.current = clampedIndex;
    const openRef = useRef(open);
    openRef.current = open;

    // Reset the highlight whenever the query changes (the list is rebuilt).
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const select = useCallback(
        (index: number) => {
            const item = itemsRef.current[index];
            if (!item) return;
            editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !deleteMentionQuery(selection)) return;
                const mentionNode = $createMentionNode(`@${item.name}`);
                selection.insertNodes([mentionNode]);
                const space = $createTextNode(' ');
                mentionNode.insertAfter(space);
                space.select();
            });
            setQuery(null);
        },
        [editor]
    );
    const selectRef = useRef(select);
    selectRef.current = select;

    // 1. Track the active "@query" on every editor update — including each input
    //    during IME composition (Lexical updates its model there), so the list
    //    filters from the first composed syllable.
    useEffect(
        () =>
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                        setQuery(null);
                        return;
                    }
                    const anchor = selection.anchor;
                    const node = anchor.getNode();
                    if (anchor.type !== 'text' || !$isTextNode(node) || !node.isSimpleText()) {
                        setQuery(null);
                        return;
                    }
                    const match = checkForMentionMatch(node.getTextContent().slice(0, anchor.offset));
                    setQuery(match ? match.matchingString : null);
                });
            }),
        [editor]
    );

    // 2. Nav + non-composing select via a native capture-phase listener on the
    //    editor's parent — it fires before Lexical's own root listener, so we consume
    //    arrows/Enter/Tab before they move the caret or send. The composing Enter
    //    can't be caught here (the IME owns that keydown); it's handled by the command
    //    guard in (3).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!openRef.current) return;
            const len = itemsRef.current.length;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopImmediatePropagation();
                setActiveIndex(i => (Math.min(i, len - 1) + 1) % len);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopImmediatePropagation();
                setActiveIndex(i => (Math.min(i, len - 1) - 1 + len) % len);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                setQuery(null);
            } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                e.stopImmediatePropagation();
                selectRef.current(indexRef.current);
            }
        };
        return editor.registerRootListener((root, prevRoot) => {
            prevRoot?.parentElement?.removeEventListener('keydown', onKeyDown, true);
            root?.parentElement?.addEventListener('keydown', onKeyDown, true);
        });
    }, [editor]);

    // 3. Command guard for the IME case: a composing Enter never reaches keydown
    //    handling (Lexical ignores keys while composing), but Lexical re-dispatches
    //    KEY_ENTER on compositionend with isComposing already false — which would
    //    otherwise reach SubmitPlugin and SEND. Intercept above SubmitPlugin (LOW):
    //    while the menu is open, pick the highlighted member and consume the key.
    //    (Plain Enter is already consumed at keydown; Shift+Enter falls through to a
    //    line break.)
    useEffect(() => {
        const onSelectKey = (event: KeyboardEvent | null): boolean => {
            if (!openRef.current || event?.shiftKey) return false;
            selectRef.current(indexRef.current);
            return true;
        };
        const unEnter = editor.registerCommand(KEY_ENTER_COMMAND, onSelectKey, COMMAND_PRIORITY_CRITICAL);
        const unTab = editor.registerCommand(KEY_TAB_COMMAND, onSelectKey, COMMAND_PRIORITY_CRITICAL);
        return () => {
            unEnter();
            unTab();
        };
    }, [editor]);

    // 3. Render the menu above the input (portaled into the editor's relative
    //    parent so `bottom-full` anchors to it).
    const parent = editor.getRootElement()?.parentElement ?? null;
    if (!open || !parent) return null;
    return createPortal(<MentionAutocomplete items={items} activeIndex={clampedIndex} onSelect={select} />, parent);
};
