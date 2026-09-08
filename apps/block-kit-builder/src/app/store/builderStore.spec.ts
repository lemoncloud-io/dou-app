import { beforeEach, describe, expect, it } from 'vitest';

import type { KnownBlock } from '@chatic/block-kit';

import { useBuilderStore } from './builderStore';

const reset = () => {
    localStorage.clear();
    useBuilderStore.setState({ blocks: [], past: [], future: [], lastEdit: null, seeded: false, dragIndex: null });
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
        const stored = JSON.parse(localStorage.getItem('dou-block-kit-builder') ?? '{}');
        expect(Object.keys(stored.state).sort()).toEqual(['blocks', 'seeded']);
        expect(stored.state.blocks).toEqual([{ type: 'divider' }]);
    });

    // A typed word is one undo, not one per letter. Without this the stack grows
    // with the message and undo walks back a character at a time.
    it('joins consecutive edits of the same block into one history entry', () => {
        useBuilderStore.getState().addBlock('header');
        const depth = useBuilderStore.getState().past.length;
        for (const text of ['H', 'He', 'Hel']) {
            useBuilderStore.getState().replaceBlock(0, { type: 'header', text: { type: 'plain_text', text } });
        }
        expect(useBuilderStore.getState().past.length).toBe(depth + 1);
        useBuilderStore.getState().undo();
        expect(blocks()).toEqual([{ type: 'header', text: { type: 'plain_text', text: 'Heading' } }]);
    });

    it('starts a new entry when the edit moves to another block', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('header');
        const depth = useBuilderStore.getState().past.length;
        useBuilderStore.getState().replaceBlock(0, { type: 'divider' });
        useBuilderStore.getState().replaceBlock(1, { type: 'divider' });
        expect(useBuilderStore.getState().past.length).toBe(depth + 2);
    });

    // Otherwise the next keystroke would extend a snapshot the reader has already
    // walked away from, and the edit they just undid would be unreachable.
    it('breaks the run on undo', () => {
        useBuilderStore.getState().addBlock('header');
        useBuilderStore.getState().replaceBlock(0, { type: 'divider' });
        useBuilderStore.getState().undo();
        const depth = useBuilderStore.getState().past.length;
        useBuilderStore.getState().replaceBlock(0, { type: 'divider' });
        expect(useBuilderStore.getState().past.length).toBe(depth + 1);
    });

    it('caps the history so a session that never reloads cannot grow without bound', () => {
        for (let i = 0; i < 150; i += 1) useBuilderStore.getState().addBlock('divider');
        expect(useBuilderStore.getState().past.length).toBe(100);
    });

    it('seeds an unused builder once and never again', () => {
        const seed = [{ type: 'divider' } as const];
        useBuilderStore.getState().seed(seed);
        expect(blocks()).toEqual(seed);
        useBuilderStore.getState().clear();
        useBuilderStore.getState().seed(seed);
        expect(blocks()).toEqual([]);
    });

    // A drag asks "does it read better here?", and the message has to answer while
    // the block is still moving — so the array reorders on every hover, not on drop.
    it('reorders under the pointer without recording each step', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('section');
        store.addBlock('divider');
        const depth = useBuilderStore.getState().past.length;

        useBuilderStore.getState().beginDrag(2);
        useBuilderStore.getState().previewDrag(1);
        useBuilderStore.getState().previewDrag(0);
        expect(blocks().map(block => block.type)).toEqual(['divider', 'header', 'section']);
        expect(useBuilderStore.getState().past.length).toBe(depth);

        useBuilderStore.getState().endDrag();
        expect(useBuilderStore.getState().past.length).toBe(depth + 1);
        expect(useBuilderStore.getState().dragIndex).toBeNull();
    });

    // One entry for the whole gesture: undo returns to where the drag began, not to
    // the halfway arrangement the pointer happened to pass through.
    it('undoes a whole drag at once', () => {
        const store = useBuilderStore.getState();
        store.addBlock('header');
        store.addBlock('divider');
        useBuilderStore.getState().beginDrag(1);
        useBuilderStore.getState().previewDrag(0);
        useBuilderStore.getState().endDrag();
        useBuilderStore.getState().undo();
        expect(blocks().map(block => block.type)).toEqual(['header', 'divider']);
    });

    // Picking a block up and putting it back is not an edit.
    it('records nothing when a drag ends where it started', () => {
        useBuilderStore.getState().addBlock('header');
        const depth = useBuilderStore.getState().past.length;
        useBuilderStore.getState().beginDrag(0);
        useBuilderStore.getState().endDrag();
        expect(useBuilderStore.getState().past.length).toBe(depth);
    });

    it('ignores a hover outside the list', () => {
        useBuilderStore.getState().addBlock('header');
        useBuilderStore.getState().beginDrag(0);
        useBuilderStore.getState().previewDrag(5);
        expect(useBuilderStore.getState().dragIndex).toBe(0);
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
