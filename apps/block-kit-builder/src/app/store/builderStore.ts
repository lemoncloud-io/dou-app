import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { KnownBlock } from '@chatic/block-kit';

import { createBlock, type BlockKind } from './blockFactory';

/** Where the message is kept between visits. */
const STORAGE_KEY = 'dou-block-kit-builder';

/**
 * Which edit produced the current blocks, when consecutive edits of that kind
 * should read as one. Typing into a block is the case that matters: without it
 * every character is its own history entry, so undo walks back a letter at a
 * time and the stack grows with the message.
 */
type EditKey = `replace:${number}` | null;

interface BuilderState {
    blocks: KnownBlock[];
    /** Snapshots behind and ahead of `blocks` — what undo and redo walk. */
    past: KnownBlock[][];
    future: KnownBlock[][];
    /** What the last commit was, so the next one can decide to join it. */
    lastEdit: EditKey;
    /**
     * Has this builder ever held a message?
     *
     * Persisted, because an empty block list cannot answer it: "never opened" and
     * "the reader cleared it" look identical and want opposite treatment — one
     * gets the example, the other gets left alone.
     */
    seeded: boolean;

    addBlock: (kind: BlockKind) => void;
    removeBlock: (index: number) => void;
    moveBlock: (index: number, direction: -1 | 1) => void;
    replaceBlock: (index: number, block: KnownBlock) => void;
    /** Wholesale replacement — the payload editor and the templates use it. */
    setBlocks: (blocks: KnownBlock[]) => void;
    /** Fill a builder that has never held a message. A no-op on every later visit. */
    seed: (blocks: KnownBlock[]) => void;

    /**
     * A drag, as three calls.
     *
     * The message reorders under the pointer rather than on drop, so the reader
     * judges the arrangement while choosing it. That means many block arrays for
     * one decision, and only the first and last are worth remembering: `begin`
     * keeps the arrangement being left, `preview` moves blocks without touching
     * history, and `end` records the whole drag as a single undo.
     */
    beginDrag: (index: number) => void;
    previewDrag: (index: number) => void;
    endDrag: () => void;
    /** Which block is under the pointer, or null when nothing is being dragged. */
    dragIndex: number | null;

    undo: () => void;
    redo: () => void;
    /** Empty the message. Undoable like any other edit. */
    clear: () => void;
}

/**
 * The one piece of shared state in the app: three panes read the same block
 * array, which is exactly what Zustand is for here and what `useState` in the
 * layout could not do without threading setters through every pane.
 *
 * Every mutation goes through `commit`, so the history is a property of the
 * store rather than something each action remembers to maintain.
 */

/**
 * How many edits back the reader can walk. A message is a few dozen blocks, so
 * the cap is a backstop against a session that never reloads rather than a limit
 * anyone should reach.
 */
const HISTORY_LIMIT = 100;

/**
 * The arrangement a drag started from. Outside the store because it is scaffolding
 * for one gesture, not state any pane reads — and persisting it would restore a
 * half-finished drag from a previous visit.
 */
let dragOrigin: KnownBlock[] | null = null;

const commit = (state: BuilderState, blocks: KnownBlock[], edit: EditKey = null): Partial<BuilderState> => {
    // Consecutive edits of the same kind extend the entry already on the stack
    // instead of adding one, so a typed word is one undo rather than five.
    const past = edit !== null && edit === state.lastEdit ? state.past : [...state.past, state.blocks];
    return {
        blocks,
        past: past.slice(-HISTORY_LIMIT),
        // A new edit invalidates the redo stack: the branch it belonged to is gone.
        future: [],
        lastEdit: edit,
    };
};

export const useBuilderStore = create<BuilderState>()(
    persist(
        (set, get) => ({
            blocks: [],
            past: [],
            future: [],

            addBlock: kind => set(state => commit(state, [...state.blocks, createBlock(kind)])),

            removeBlock: index =>
                set(state =>
                    commit(
                        state,
                        state.blocks.filter((_, i) => i !== index)
                    )
                ),

            moveBlock: (index, direction) =>
                set(state => {
                    const target = index + direction;
                    if (target < 0 || target >= state.blocks.length) return {};
                    const blocks = [...state.blocks];
                    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
                    return commit(state, blocks);
                }),

            replaceBlock: (index, block) =>
                set(state =>
                    commit(
                        state,
                        state.blocks.map((current, i) => (i === index ? block : current)),
                        `replace:${index}`
                    )
                ),

            setBlocks: blocks => {
                // Guard against the payload editor committing a value it just rendered:
                // an identical array would otherwise push a history entry per keystroke.
                if (JSON.stringify(get().blocks) === JSON.stringify(blocks)) return;
                set(state => commit(state, blocks));
            },

            seed: blocks => {
                if (get().seeded) return;
                set({ blocks, seeded: true });
            },

            beginDrag: index => {
                dragOrigin = get().blocks;
                set({ dragIndex: index });
            },

            previewDrag: index => {
                const { dragIndex, blocks } = get();
                if (dragIndex === null || dragIndex === index || index < 0 || index >= blocks.length) return;
                const next = [...blocks];
                next.splice(index, 0, ...next.splice(dragIndex, 1));
                set({ blocks: next, dragIndex: index });
            },

            endDrag: () => {
                const origin = dragOrigin;
                dragOrigin = null;
                set(state => {
                    if (!origin || origin === state.blocks) return { dragIndex: null };
                    // One entry for the whole drag: the arrangement the reader left.
                    return {
                        dragIndex: null,
                        past: [...state.past, origin].slice(-HISTORY_LIMIT),
                        future: [],
                        lastEdit: null,
                    };
                });
            },

            undo: () =>
                set(state => {
                    const previous = state.past.at(-1);
                    if (!previous) return {};
                    return {
                        blocks: previous,
                        past: state.past.slice(0, -1),
                        future: [state.blocks, ...state.future],
                        lastEdit: null,
                    };
                }),

            redo: () =>
                set(state => {
                    const [next, ...rest] = state.future;
                    if (!next) return {};
                    return { blocks: next, past: [...state.past, state.blocks], future: rest, lastEdit: null };
                }),

            clear: () => set(state => (state.blocks.length ? commit(state, []) : {})),
        }),
        {
            name: STORAGE_KEY,
            // Only the message survives a reload. The history is a record of one
            // sitting; restoring it would offer to undo edits the reader cannot see
            // and, on a long session, would grow the stored value without bound.
            partialize: state => ({ blocks: state.blocks, seeded: state.seeded }),
        }
    )
);
