import { cn } from '@chatic/lib/utils';

import { PALETTE, useBuilderStore } from '../../store';

/**
 * What you can add.
 *
 * A plain list of names, per the design: the rail is already three stacked
 * lists, and boxing one of them makes the palette read as the pane's subject
 * rather than as one step of the work. The hint is the row's title rather than
 * always-on helper text — five permanent explanations would outweigh the five
 * things they explain.
 *
 * The glyph the bordered version carried is not lost with the box: the block
 * list below draws the same glyph beside every block already in the message,
 * which is where telling two `section`s apart by shape actually matters.
 */
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
