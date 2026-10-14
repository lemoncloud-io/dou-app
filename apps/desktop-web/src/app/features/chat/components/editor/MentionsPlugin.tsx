import {
    useCallback,
    useEffect,
    useId,
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
    COMMAND_PRIORITY_LOW,
    KEY_ENTER_COMMAND,
    KEY_SPACE_COMMAND,
    type LexicalEditor,
} from 'lexical';

import { MentionAutocomplete, type Mentionable } from '../MentionAutocomplete';
import { $createMentionNode, $isMentionNode } from './MentionNode';
import { findMentionAtCaret } from './mentionAtCaret';

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
        if (!q) return mentionables;
        const people = mentionables.filter(m => !m.everyone && m.name.toLowerCase().includes(q));
        // The everyone row is titled one way and writes another word; the start of either finds it.
        // Only the start, and after the people: Enter picks the first row, and letters that also
        // sit inside "all" or "Everyone" are far more often a name being typed. Calling the whole
        // channel by accident is the costlier mistake.
        const everyone = mentionables.filter(
            m => m.everyone && [m.name, ...(m.keywords ?? [])].some(word => word.toLowerCase().startsWith(q))
        );
        return [...people, ...everyone];
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

    // Reset the highlight whenever the list is rebuilt. A bare @ opens with the
    // everyone row first (phone parity) but highlights the first person — Enter
    // calling the whole channel is the costlier mistake.
    useEffect(() => {
        setActiveIndex(query === '' && mentionables.length > 1 && mentionables[0]?.everyone ? 1 : 0);
    }, [query, mentionables]);

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
                    const mentionNode = $createMentionNode(
                        `@${item.name}`,
                        item.everyone ? { everyone: true } : { userId: item.id }
                    );
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
        // Shift+Tab walks focus out of the composer with the list still open; a
        // list nobody sees must not keep swallowing keys. Mousedown picks keep
        // focus in the editor (preventDefault), so a blur truly leaving both the
        // editor and the menu means the reader moved on.
        const onFocusOut = (e: FocusEvent) => {
            if (!openRef.current) return;
            const next = e.relatedTarget as Node | null;
            if (next && (menuRef.current?.contains(next) || editor.getRootElement()?.contains(next))) return;
            close();
        };
        return editor.registerRootListener((root, prevRoot) => {
            const prevParent = prevRoot?.parentElement;
            if (prevParent) {
                prevParent.removeEventListener('keydown', onKeyDown, true);
                prevParent.removeEventListener('focusout', onFocusOut);
            }
            const parent = root?.parentElement;
            if (parent) {
                parent.addEventListener('keydown', onKeyDown, true);
                parent.addEventListener('focusout', onFocusOut);
            }
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

// A picked mention arrives with a space after it, so a word can follow straight away. The space
// most people type next out of habit then doubled it ("@Ada  hello"). This drops a space typed
// right after that one, while the caret still sits between it and the chip.
const useMentionSpaceDedupe = (editor: LexicalEditor): void => {
    useEffect(
        () =>
            editor.registerCommand(
                KEY_SPACE_COMMAND,
                event => {
                    // A space that commits a Korean (IME) composition is part of that input, not a
                    // second separator.
                    if (event.isComposing) return false;
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
                    const { anchor } = selection;
                    const node = anchor.getNode();
                    const isAfterAutoSpace =
                        anchor.type === 'text' &&
                        anchor.offset === 1 &&
                        $isTextNode(node) &&
                        node.getTextContent().startsWith(' ') &&
                        $isMentionNode(node.getPreviousSibling());
                    if (!isAfterAutoSpace) return false;
                    event.preventDefault();
                    return true;
                },
                COMMAND_PRIORITY_LOW
            ),
        [editor]
    );
};

interface MentionsPluginProps {
    mentionables: Mentionable[];
}

// The list's box: w-64 wide, never taller than max-h-64.
const MENU_WIDTH = 256;
const MENU_MAX_HEIGHT = 256;
const VIEWPORT_EDGE = 8;

export interface MenuAnchor {
    left: number;
    /** True when the caret sits too near the top to fit the list above it. */
    below: boolean;
}

/**
 * Keep the caret-anchored list inside the viewport: clamp the left edge, and
 * flip below the caret when nothing fits above. Pure, so the edges are unit-tested.
 */
export const clampMenuAnchor = (
    caret: { left: number; top: number },
    viewportWidth: number,
    viewportHeight: number
): MenuAnchor => {
    const left = Math.min(
        Math.max(VIEWPORT_EDGE, caret.left),
        Math.max(VIEWPORT_EDGE, viewportWidth - MENU_WIDTH - VIEWPORT_EDGE)
    );
    const aboveFits = caret.top >= MENU_MAX_HEIGHT + VIEWPORT_EDGE;
    const belowFits = caret.top + MENU_MAX_HEIGHT + VIEWPORT_EDGE <= viewportHeight;
    // Above by default; below when nothing fits above and something fits below.
    // A viewport that fits neither keeps above — the status quo, with the caret visible.
    return { left, below: !aboveFits && belowFits };
};

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
    const listId = useId();
    const { items, activeIndex, caretRect, open, select, close, openRef, itemsRef, indexRef, setActiveIndex } =
        useMentionTypeahead(editor, mentionables);

    useMentionKeyboardSelect(editor, { openRef, itemsRef, indexRef, setActiveIndex, select, close, menuRef });
    useMentionSpaceDedupe(editor);

    // While the list is open the editor is a combobox naming it; restored after,
    // so a closed box never misleads a screen reader about what typing does.
    useEffect(() => {
        const root = editor.getRootElement();
        if (!root || !open) return;
        root.setAttribute('role', 'combobox');
        root.setAttribute('aria-expanded', 'true');
        root.setAttribute('aria-autocomplete', 'list');
        root.setAttribute('aria-controls', listId);
        // Lexical's own role is "textbox": restore it, don't leave the box role-less.
        return () => {
            root.setAttribute('role', 'textbox');
            root.removeAttribute('aria-expanded');
            root.removeAttribute('aria-autocomplete');
            root.removeAttribute('aria-controls');
            root.removeAttribute('aria-activedescendant');
        };
    }, [editor, open, listId]);
    useEffect(() => {
        const root = editor.getRootElement();
        if (!root || !open) return;
        root.setAttribute('aria-activedescendant', `${listId}-option-${activeIndex}`);
    }, [editor, open, listId, activeIndex]);

    if (!open || !caretRect) return null;
    const anchor =
        typeof window === 'undefined'
            ? { left: caretRect.left, below: false }
            : clampMenuAnchor(caretRect, window.innerWidth, window.innerHeight);
    // Anchor a fixed wrapper at the caret; the list floats above it, or below
    // when the caret sits near the top, so the menu follows the caret.
    return createPortal(
        <div ref={menuRef} className="fixed z-popover" style={{ left: anchor.left, top: caretRect.top }}>
            <MentionAutocomplete
                items={items}
                activeIndex={activeIndex}
                onSelect={select}
                listId={listId}
                below={anchor.below}
            />
        </div>,
        document.body
    );
};
