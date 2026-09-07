import { beforeEach, describe, expect, it } from 'vitest';

import type { KnownBlock } from '@chatic/block-kit';

import { BUILDER_STORAGE_KEY, useBuilderStore } from './builderStore';

const reset = () => {
    localStorage.clear();
    useBuilderStore.setState({ blocks: [], past: [], future: [] });
};
const blocks = (): KnownBlock[] => useBuilderStore.getState().blocks;

describe('useBuilderStore', () => {
    beforeEach(reset);

    it('adds a filled-in block so the preview shows something at once', () => {
        useBuilderStore.getState().addBlock('header');
        expect(blocks()).toEqual([{ type: 'header', text: { type: 'plain_text', text: 'Heading' } }]);
    });

    it('removes the block at the index and leaves the rest in order', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('divider');
        store.addBlock('context');
        useBuilderStore.getState().removeBlock(1);
        expect(blocks().map(block => block.type)).toEqual(['header', 'context']);
    });

    it('swaps a block with its neighbour', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('divider');
        useBuilderStore.getState().moveBlock(1, -1);
        expect(blocks().map(block => block.type)).toEqual(['divider', 'header']);
    });

    // Off the ends is a no-op, not a wrap: the buttons are disabled there, and a
    // wrap would move a block the reader was trying to hold still.
    it.each([
        [0, -1 as const],
        [1, 1 as const],
    ])('leaves the order alone when moving index %i past the end', (index, direction) => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('divider');
        const before = blocks();
        useBuilderStore.getState().moveBlock(index, direction);
        expect(blocks()).toEqual(before);
    });

    it('records the previous array on every edit', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        useBuilderStore.getState().addBlock('divider');
        expect(useBuilderStore.getState().past).toEqual([
            [],
            [{ type: 'header', text: { type: 'plain_text', text: 'Heading' } }],
        ]);
    });

    it('walks back to the previous message and forward again', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('divider');
        useBuilderStore.getState().undo();
        expect(blocks().map(block => block.type)).toEqual(['header']);
        useBuilderStore.getState().redo();
        expect(blocks().map(block => block.type)).toEqual(['header', 'divider']);
    });

    // The branch the redo stack belonged to no longer exists, so offering to walk
    // back into it would restore a message the reader never had.
    it('drops the redo stack once a new edit is made', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        useBuilderStore.getState().undo();
        useBuilderStore.getState().addBlock('divider');
        expect(useBuilderStore.getState().future).toEqual([]);
    });

    it.each([['undo'], ['redo']] as const)('%ss nothing when there is nothing to walk to', action => {
        useBuilderStore.getState()[action]();
        expect(blocks()).toEqual([]);
    });

    // Clear is a normal edit — that is why it needs no confirmation dialog.
    it('empties the message but leaves it recoverable', () => {
        useBuilderStore.getState().addBlock('header');
        useBuilderStore.getState().clear();
        expect(blocks()).toEqual([]);
        useBuilderStore.getState().undo();
        expect(blocks().map(block => block.type)).toEqual(['header']);
    });

    // Only the message is worth restoring. Persisting the stack would offer to undo
    // edits from a session the reader cannot see, and grow without bound.
    it('persists the blocks and nothing else', () => {
        useBuilderStore.getState().addBlock('divider');
        const stored = JSON.parse(localStorage.getItem(BUILDER_STORAGE_KEY) ?? '{}');
        expect(Object.keys(stored.state)).toEqual(['blocks']);
        expect(stored.state.blocks).toEqual([{ type: 'divider' }]);
    });

    // The payload editor re-commits what it just rendered on every keystroke.
    // Without this, undo would have to be pressed once per character typed.
    it('ignores a setBlocks that changes nothing', () => {
        useBuilderStore.getState().addBlock('divider');
        const past = useBuilderStore.getState().past;
        useBuilderStore.getState().setBlocks([{ type: 'divider' }]);
        expect(useBuilderStore.getState().past).toBe(past);
    });
});
