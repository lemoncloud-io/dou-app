import { beforeEach, describe, expect, it } from 'vitest';

import type { KnownBlock } from '@chatic/block-kit';

import { useBuilderStore } from './builderStore';

const reset = () => useBuilderStore.setState({ blocks: [], past: [], future: [] });
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

    // The payload editor re-commits what it just rendered on every keystroke.
    // Without this, undo would have to be pressed once per character typed.
    it('ignores a setBlocks that changes nothing', () => {
        useBuilderStore.getState().addBlock('divider');
        const past = useBuilderStore.getState().past;
        useBuilderStore.getState().setBlocks([{ type: 'divider' }]);
        expect(useBuilderStore.getState().past).toBe(past);
    });
});
