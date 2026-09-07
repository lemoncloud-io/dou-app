import { create } from 'zustand';

import type { KnownBlock } from '@chatic/block-kit';

import { createBlock, type BlockKind } from './blockFactory';

interface BuilderState {
    blocks: KnownBlock[];
    /** Snapshots behind and ahead of `blocks`. Undo/redo land in a later slice. */
    past: KnownBlock[][];
    future: KnownBlock[][];

    addBlock: (kind: BlockKind) => void;
    removeBlock: (index: number) => void;
    moveBlock: (index: number, direction: -1 | 1) => void;
    replaceBlock: (index: number, block: KnownBlock) => void;
    /** Wholesale replacement — the payload editor and the templates use it. */
    setBlocks: (blocks: KnownBlock[]) => void;
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

export const useBuilderStore = create<BuilderState>((set, get) => ({
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
}));
