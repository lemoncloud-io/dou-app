import { Plus } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { PALETTE, useBuilderStore } from '../../store';

/**
 * What you can add. Each entry says what it draws rather than naming its schema
 * type — the reader is composing a message, not filling in JSON, and the JSON is
 * visible in the next pane anyway.
 */
export const BlockPalette = () => {
    const addBlock = useBuilderStore(state => state.addBlock);

    return (
        <ul className="flex flex-col gap-0.5 px-2">
            {PALETTE.map(entry => (
                <li key={entry.kind}>
                    <button
                        type="button"
                        onClick={() => addBlock(entry.kind)}
                        title={entry.hint}
                        className={cn(
                            'focus-ring tactile flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                            'text-callout text-foreground transition-colors ease-tactile hover:bg-accent'
                        )}
                    >
                        <Plus size={14} className="shrink-0 text-muted-foreground" />
                        {entry.label}
                    </button>
                </li>
            ))}
        </ul>
    );
};
