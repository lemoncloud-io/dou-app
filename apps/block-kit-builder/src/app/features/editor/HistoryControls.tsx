import { Redo2, Trash2, Undo2 } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import { useBuilderStore } from '../../store';
import { ICON_CONTROL } from './controlStyles';

const BUTTON = cn(ICON_CONTROL, 'h-7 w-7');

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
