import { cn } from '@chatic/lib/utils';

import { PALETTE, useBuilderStore } from '../../store';
import { BlockGlyph } from '../editor';

/**
 * What you can add.
 *
 * Each row shows the block at thumbnail size beside its name, so the choice can
 * be made by shape. The hint is the row's title rather than always-on helper
 * text — five permanent explanations would outweigh the five things they explain.
 */
export const BlockPalette = () => {
    const addBlock = useBuilderStore(state => state.addBlock);

    return (
        <ul className="grid grid-cols-2 gap-1 px-3">
            {PALETTE.map(entry => (
                <li key={entry.kind}>
                    <button
                        type="button"
                        onClick={() => addBlock(entry.kind)}
                        title={entry.hint}
                        className={cn(
                            'focus-ring tactile flex w-full items-center gap-2 rounded-md border border-hairline',
                            'bg-background px-2 py-1.5 text-left text-caption text-foreground',
                            'transition-colors ease-tactile hover:border-primary/40 hover:bg-accent'
                        )}
                    >
                        <span className="text-muted-foreground">
                            <BlockGlyph kind={entry.kind} />
                        </span>
                        {entry.label}
                    </button>
                </li>
            ))}
        </ul>
    );
};
