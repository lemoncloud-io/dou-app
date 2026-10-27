import { createContext, useContext } from 'react';

/**
 * The few words the renderer itself puts on screen, as opposed to the text the
 * blocks carry.
 *
 * This lib has no i18n of its own and should not grow one: its callers already
 * do, and each translates differently (web fetches `/locales`, desktop-web
 * bundles typed tables, the builder has none). So a caller hands its own
 * translation to `BlockKitMessage` through `labels`, and anything it leaves out
 * reads in English — which is what the builder's preview wants anyway.
 */
export interface BlockKitLabels {
    /** Toggle on a folded code block; `hiddenLines` is how many lines the fold hides. */
    expandCode: (hiddenLines: number) => string;
    collapseCode: string;
    /** Heard after the heading when the heading opens the message's source; not drawn. */
    openSource: string;
}

export const DEFAULT_BLOCK_KIT_LABELS: BlockKitLabels = {
    expandCode: hiddenLines => `View more (${hiddenLines} lines)`,
    collapseCode: 'View less',
    openSource: 'View source',
};

export const BlockKitLabelsContext = createContext<BlockKitLabels>(DEFAULT_BLOCK_KIT_LABELS);

export const useBlockKitLabels = (): BlockKitLabels => useContext(BlockKitLabelsContext);
