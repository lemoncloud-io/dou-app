import { cn } from '@chatic/ui-kit';

import { PALETTE, useBuilderStore } from '../../store';

export const BlockPalette = () => {
    const addBlock = useBuilderStore(state => state.addBlock);

    return (
        <ul className="flex flex-col px-2">
            {PALETTE.map(entry => (
                <li key={entry.kind}>
                    <button
                        type="button"
                        onClick={() => addBlock(entry.kind)}
                        title={entry.hint}
                        className={cn(
                            'focus-ring tactile flex w-full items-center rounded-md px-2 py-2.5 text-left lg:py-2',
                            'text-caption text-foreground transition-colors ease-tactile hover:bg-accent'
                        )}
                    >
                        {entry.label}
                    </button>
                </li>
            ))}
        </ul>
    );
};
