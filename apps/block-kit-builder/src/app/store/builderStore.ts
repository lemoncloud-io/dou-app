import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { KnownBlock } from '@chatic/block-kit';

import { deviceStore, persistStorageOver } from '../storage';
import { createBlock, type BlockKind } from './blockFactory';

const STORAGE_KEY = 'dou-block-kit-builder';

type EditKey = `replace:${number}` | null;

interface BuilderState {
    blocks: KnownBlock[];
    past: KnownBlock[][];
    future: KnownBlock[][];
    lastEdit: EditKey;
    seeded: boolean;

    addBlock: (kind: BlockKind) => void;
    removeBlock: (index: number) => void;
    moveBlock: (index: number, direction: -1 | 1) => void;
    replaceBlock: (index: number, block: KnownBlock) => void;
    setBlocks: (blocks: KnownBlock[]) => void;
    seed: (blocks: KnownBlock[]) => void;

    beginDrag: (index: number) => void;
    previewDrag: (index: number) => void;
    endDrag: () => void;
    dragIndex: number | null;

    undo: () => void;
    redo: () => void;
    clear: () => void;
}

const HISTORY_LIMIT = 100;

let dragOrigin: KnownBlock[] | null = null;

const commit = (state: BuilderState, blocks: KnownBlock[], edit: EditKey = null): Partial<BuilderState> => {
    const past = edit !== null && edit === state.lastEdit ? state.past : [...state.past, state.blocks];
    return {
        blocks,
        past: past.slice(-HISTORY_LIMIT),
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
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ blocks: state.blocks, seeded: state.seeded }),
        }
    )
);
