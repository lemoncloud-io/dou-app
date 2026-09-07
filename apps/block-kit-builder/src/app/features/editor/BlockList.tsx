import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { describeBlock, useBuilderStore } from '../../store';
import { BlockFields } from './BlockFields';

const ICON_BUTTON = cn(
    'focus-ring tactile flex h-6 w-6 items-center justify-center rounded',
    'text-muted-foreground transition-colors ease-tactile hover:bg-accent disabled:opacity-30'
);

/**
 * The blocks in the message, in order, each with its own inputs.
 *
 * Reordering is two buttons rather than a drag handle: the list is short, the
 * moves are one step at a time, and a keyboard reaches buttons.
 */
export const BlockList = () => {
    const blocks = useBuilderStore(state => state.blocks);
    const { removeBlock, moveBlock, replaceBlock } = useBuilderStore.getState();

    if (!blocks.length) {
        return <p className="px-4 py-2 text-callout text-muted-foreground">No blocks yet. Add one above.</p>;
    }

    return (
        <ol className="flex flex-col gap-2 px-2 py-2">
            {blocks.map((block, index) => (
                <li key={index} className="rounded-md border border-hairline bg-background p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                        <span className="text-overline uppercase text-muted-foreground">{describeBlock(block)}</span>
                        <div className="flex items-center gap-0.5">
                            <button
                                type="button"
                                aria-label={`Move ${describeBlock(block)} up`}
                                className={ICON_BUTTON}
                                disabled={index === 0}
                                onClick={() => moveBlock(index, -1)}
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                type="button"
                                aria-label={`Move ${describeBlock(block)} down`}
                                className={ICON_BUTTON}
                                disabled={index === blocks.length - 1}
                                onClick={() => moveBlock(index, 1)}
                            >
                                <ChevronDown size={14} />
                            </button>
                            <button
                                type="button"
                                aria-label={`Remove ${describeBlock(block)}`}
                                className={cn(ICON_BUTTON, 'hover:text-destructive')}
                                onClick={() => removeBlock(index)}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    <BlockFields block={block} onChange={next => replaceBlock(index, next)} />
                </li>
            ))}
        </ol>
    );
};
