import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type MutableRefObject,
    type RefObject,
    type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $createTextNode,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_CRITICAL,
    KEY_ENTER_COMMAND,
    type LexicalEditor,
    type RangeSelection,
    type TextNode,
} from 'lexical';

import { MENTION_TOKEN_SOURCE } from '../../../../shared';
import { MentionAutocomplete, type Mentionable } from '../MentionAutocomplete';
import { $createMentionNode } from './MentionNode';

// Word-start "@" + token chars up to the caret (same class RichText renders).
const MENTION_MATCH = new RegExp(`(^|[\\s([{])(@(${MENTION_TOKEN_SOURCE}*))$`, 'u');

interface MentionAtCaret {
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
const findMentionAtCaret = (selection: RangeSelection): MentionAtCaret | null => {
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

interface CaretRect {
    left: number;
    top: number;
}

interface MentionTypeahead {
    items: Mentionable[];
    activeIndex: number;
    caretRect: CaretRect | null;
    open: boolean;
    select: (index: number) => void;
    close: () => void;
    openRef: MutableRefObject<boolean>;
    itemsRef: MutableRefObject<Mentionable[]>;
    indexRef: MutableRefObject<number>;
    setActiveIndex: Dispatch<SetStateAction<number>>;
}

// State + filtering + the "@query" replacement. Tracks the active mention from every
// editor update (composition included, so Korean/CJK filters from the first syllable)
// and records the caret rect so the menu can follow the caret.
const useMentionTypeahead = (editor: LexicalEditor, mentionables: Mentionable[]): MentionTypeahead => {
    const [query, setQuery] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [caretRect, setCaretRect] = useState<CaretRect | null>(null);

    const items = useMemo(() => {
        if (query === null || !mentionables.length) return [];
        const q = query.toLowerCase();
        return q ? mentionables.filter(m => m.name.toLowerCase().includes(q)) : mentionables;
    }, [query, mentionables]);
    const open = items.length > 0;
    const activeClamped = Math.min(activeIndex, items.length - 1);

    const itemsRef = useRef(items);
    itemsRef.current = items;
    const indexRef = useRef(activeClamped);
    indexRef.current = activeClamped;
    const openRef = useRef(open);
    openRef.current = open;

    const close = useCallback(() => setQuery(null), []);

    // Reset the highlight whenever the list is rebuilt.
    useEffect(() => setActiveIndex(0), [query]);

    const select = useCallback(
        (index: number) => {
            const item = itemsRef.current[index];
            if (item) {
                editor.update(() => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) return;
                    const found = findMentionAtCaret(selection);
                    if (!found) return;
                    // Expand the collapsed caret back over "@query", then replace it.
                    selection.anchor.set(found.startKey, found.startOffset, 'text');
                    const mentionNode = $createMentionNode(`@${item.name}`);
                    selection.insertNodes([mentionNode]);
                    const space = $createTextNode(' ');
                    mentionNode.insertAfter(space);
                    space.select();
                });
            }
            setQuery(null);
        },
        [editor]
    );

    useEffect(
        () =>
            editor.registerUpdateListener(({ editorState }) => {
                const found = editorState.read(() => {
                    const selection = $getSelection();
                    return $isRangeSelection(selection) ? findMentionAtCaret(selection) : null;
                });
                setQuery(found ? found.query : null);
                const domSelection = found ? window.getSelection() : null;
                if (domSelection && domSelection.rangeCount > 0) {
                    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
                    setCaretRect({ left: rect.left, top: rect.top });
                }
            }),
        [editor]
    );

    return {
        items,
        activeIndex: activeClamped,
        caretRect,
        open,
        select,
        close,
        openRef,
        itemsRef,
        indexRef,
        setActiveIndex,
    };
};

interface MentionKeyboardArgs {
    openRef: MutableRefObject<boolean>;
    itemsRef: MutableRefObject<Mentionable[]>;
    indexRef: MutableRefObject<number>;
    setActiveIndex: Dispatch<SetStateAction<number>>;
    select: (index: number) => void;
    close: () => void;
    menuRef: RefObject<HTMLDivElement | null>;
}

// All event wiring. Lexical ignores keys while the IME is composing AND re-dispatches
// KEY_ENTER on compositionend (isComposing now false), so:
//   - a native capture-phase keydown (fires before Lexical) handles nav + the
//     non-composing Enter/Tab select;
//   - the composing Enter is caught by a CRITICAL command guard on that
//     re-dispatched KEY_ENTER — it selects the highlighted member and consumes the
//     key, so it never reaches SubmitPlugin (LOW) as a "send".
const useMentionKeyboardSelect = (editor: LexicalEditor, args: MentionKeyboardArgs): void => {
    const { openRef, itemsRef, indexRef, setActiveIndex, select, close, menuRef } = args;

    // Native capture-phase keydown (fires before Lexical) handles nav + the
    // non-composing Enter/Tab select. A composing Enter is left for the command guard
    // below (Lexical re-dispatches KEY_ENTER on compositionend, where it's caught).
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
                close();
            } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                e.stopImmediatePropagation();
                select(indexRef.current);
            }
        };
        return editor.registerRootListener((root, prevRoot) => {
            prevRoot?.parentElement?.removeEventListener('keydown', onKeyDown, true);
            root?.parentElement?.addEventListener('keydown', onKeyDown, true);
        });
    }, [editor, openRef, itemsRef, indexRef, setActiveIndex, select, close]);

    // The composing Enter: Lexical ignores it at keydown but re-dispatches KEY_ENTER
    // on compositionend (isComposing now false) — which SubmitPlugin (LOW) would treat
    // as "send". Intercept above it: pick the highlighted member and consume the key.
    useEffect(() => {
        const guard = (event: KeyboardEvent | null): boolean => {
            if (!openRef.current || event?.shiftKey) return false;
            select(indexRef.current);
            return true;
        };
        return editor.registerCommand(KEY_ENTER_COMMAND, guard, COMMAND_PRIORITY_CRITICAL);
    }, [editor, openRef, indexRef, select]);

    // Close on a click outside both the menu and the editor (a click inside the
    // editor moves the caret, which the update listener already reacts to).
    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (!openRef.current) return;
            const target = e.target as Node | null;
            if (menuRef.current?.contains(target) || editor.getRootElement()?.contains(target)) return;
            close();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [editor, openRef, menuRef, close]);
};

interface MentionsPluginProps {
    mentionables: Mentionable[];
}

/**
 * Self-contained "@"-typeahead. We do NOT use @lexical/react's
 * LexicalTypeaheadMenuPlugin: it suspends both its query update and its Enter handling
 * during IME composition (it bails on editor.isComposing(), and Lexical's onKeyDown
 * ignores keys while composing), which breaks Korean/CJK mentions end-to-end. See the
 * two hooks above for how composition is handled.
 */
export const MentionsPlugin = ({ mentionables }: MentionsPluginProps) => {
    const [editor] = useLexicalComposerContext();
    const menuRef = useRef<HTMLDivElement>(null);
    const { items, activeIndex, caretRect, open, select, close, openRef, itemsRef, indexRef, setActiveIndex } =
        useMentionTypeahead(editor, mentionables);

    useMentionKeyboardSelect(editor, { openRef, itemsRef, indexRef, setActiveIndex, select, close, menuRef });

    if (!open || !caretRect) return null;
    // Anchor a fixed wrapper at the caret; MentionAutocomplete's `bottom-full` floats
    // the list just above it, so the menu follows the caret.
    return createPortal(
        <div ref={menuRef} className="fixed z-50" style={{ left: caretRect.left, top: caretRect.top }}>
            <MentionAutocomplete items={items} activeIndex={activeIndex} onSelect={select} />
        </div>,
        document.body
    );
};
