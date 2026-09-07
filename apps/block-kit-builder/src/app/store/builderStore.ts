import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { KnownBlock } from '@chatic/block-kit';

import { createBlock, type BlockKind } from './blockFactory';

/** Where the message is kept between visits. Read directly to tell a first visit from a cleared one. */
export const BUILDER_STORAGE_KEY = 'dou-block-kit-builder';

interface BuilderState {
    blocks: KnownBlock[];
    /** Snapshots behind and ahead of `blocks` — what undo and redo walk. */
    past: KnownBlock[][];
    future: KnownBlock[][];

    addBlock: (kind: BlockKind) => void;
    removeBlock: (index: number) => void;
    moveBlock: (index: number, direction: -1 | 1) => void;
    replaceBlock: (index: number, block: KnownBlock) => void;
    /** Wholesale replacement — the payload editor and the templates use it. */
    setBlocks: (blocks: KnownBlock[]) => void;

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
const commit = (state: BuilderState, blocks: KnownBlock[]): Partial<BuilderState> => ({
    blocks,
    past: [...state.past, state.blocks],
    // A new edit invalidates the redo stack: the branch it belonged to is gone.
    future: [],
});

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
                        state.blocks.map((current, i) => (i === index ? block : current))
                    )
                ),

            setBlocks: blocks => {
                // Guard against the payload editor committing a value it just rendered:
                // an identical array would otherwise push a history entry per keystroke.
                if (JSON.stringify(get().blocks) === JSON.stringify(blocks)) return;
                set(state => commit(state, blocks));
            },

            undo: () =>
                set(state => {
                    const previous = state.past.at(-1);
                    if (!previous) return {};
                    return { blocks: previous, past: state.past.slice(0, -1), future: [state.blocks, ...state.future] };
                }),

            redo: () =>
                set(state => {
                    const [next, ...rest] = state.future;
                    if (!next) return {};
                    return { blocks: next, past: [...state.past, state.blocks], future: rest };
                }),

            clear: () => set(state => (state.blocks.length ? commit(state, []) : {})),
        }),
        {
            name: BUILDER_STORAGE_KEY,
            // Only the message survives a reload. The history is a record of one
            // sitting; restoring it would offer to undo edits the reader cannot see
            // and, on a long session, would grow the stored value without bound.
            partialize: state => ({ blocks: state.blocks }),
        }
    )
);
