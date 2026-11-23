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

const useMentionTypeahead = (editor: LexicalEditor, mentionables: Mentionable[]): MentionTypeahead => {
    const [query, setQuery] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [caretRect, setCaretRect] = useState<CaretRect | null>(null);

    const items = useMemo(() => {
        if (query === null || !mentionables.length) return [];
        const q = query.toLowerCase();
        if (!q) return mentionables;
        const people = mentionables.filter(m => !m.everyone && m.name.toLowerCase().includes(q));
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

const useMentionKeyboardSelect = (editor: LexicalEditor, args: MentionKeyboardArgs): void => {
    const { openRef, itemsRef, indexRef, setActiveIndex, select, close, menuRef } = args;

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

    useEffect(() => {
        const guard = (event: KeyboardEvent | null): boolean => {
            if (!openRef.current || event?.shiftKey) return false;
            select(indexRef.current);
            return true;
        };
        return editor.registerCommand(KEY_ENTER_COMMAND, guard, COMMAND_PRIORITY_CRITICAL);
    }, [editor, openRef, indexRef, select]);

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

const useMentionSpaceDedupe = (editor: LexicalEditor): void => {
    useEffect(
        () =>
            editor.registerCommand(
                KEY_SPACE_COMMAND,
                event => {
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

const MENU_WIDTH = 256;
const MENU_MAX_HEIGHT = 256;
const VIEWPORT_EDGE = 8;

export interface MenuAnchor {
    left: number;
    below: boolean;
}

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
    return { left, below: !aboveFits && belowFits };
};

export const MentionsPlugin = ({ mentionables }: MentionsPluginProps) => {
    const [editor] = useLexicalComposerContext();
    const menuRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const { items, activeIndex, caretRect, open, select, close, openRef, itemsRef, indexRef, setActiveIndex } =
        useMentionTypeahead(editor, mentionables);

    useMentionKeyboardSelect(editor, { openRef, itemsRef, indexRef, setActiveIndex, select, close, menuRef });
    useMentionSpaceDedupe(editor);

    useEffect(() => {
        const root = editor.getRootElement();
        if (!root || !open) return;
        root.setAttribute('role', 'combobox');
        root.setAttribute('aria-expanded', 'true');
        root.setAttribute('aria-autocomplete', 'list');
        root.setAttribute('aria-controls', listId);
        root.setAttribute('aria-activedescendant', `${listId}-option-${activeIndex}`);
        return () => {
            root.setAttribute('role', 'textbox');
            root.removeAttribute('aria-expanded');
            root.removeAttribute('aria-autocomplete');
            root.removeAttribute('aria-controls');
            root.removeAttribute('aria-activedescendant');
        };
    }, [editor, open, listId, activeIndex]);

    if (!open || !caretRect) return null;
    const anchor =
        typeof window === 'undefined'
            ? { left: caretRect.left, below: false }
            : clampMenuAnchor(caretRect, window.innerWidth, window.innerHeight);
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
