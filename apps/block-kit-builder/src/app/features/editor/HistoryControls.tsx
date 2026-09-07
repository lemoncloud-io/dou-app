import { Redo2, Trash2, Undo2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { useBuilderStore } from '../../store';

const BUTTON = cn(
    'focus-ring tactile flex h-7 w-7 items-center justify-center rounded',
    'text-muted-foreground transition-colors ease-tactile hover:bg-accent disabled:opacity-30'
);

/**
 * Undo, redo and clear.
 *
 * They sit over the preview because that is what they act on — the reader thinks
 * in terms of the message, not the block list or the JSON, even though all three
 * change together.
 */
export const HistoryControls = () => {
    const canUndo = useBuilderStore(state => state.past.length > 0);
    const canRedo = useBuilderStore(state => state.future.length > 0);
    const canClear = useBuilderStore(state => state.blocks.length > 0);
    const { undo, redo, clear } = useBuilderStore.getState();

    return (
        <div className="flex items-center gap-0.5">
            <button type="button" aria-label="Undo" className={BUTTON} disabled={!canUndo} onClick={undo}>
                <Undo2 size={15} />
            </button>
            <button type="button" aria-label="Redo" className={BUTTON} disabled={!canRedo} onClick={redo}>
                <Redo2 size={15} />
            </button>
            {/* No confirmation: clear is a normal edit, so undo takes it back. */}
            <button
                type="button"
                aria-label="Clear all blocks"
                className={cn(BUTTON, 'hover:text-destructive')}
                disabled={!canClear}
                onClick={clear}
            >
                <Trash2 size={15} />
            </button>
        </div>
    );
};
