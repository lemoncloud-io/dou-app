import { createContext, useContext } from 'react';

export interface BlockKitLabels {
    expandCode: (hiddenLines: number) => string;
    collapseCode: string;
    openSource: string;
}

export const DEFAULT_BLOCK_KIT_LABELS: BlockKitLabels = {
    expandCode: hiddenLines => `View more (${hiddenLines} lines)`,
    collapseCode: 'View less',
    openSource: 'View source',
};

export const BlockKitLabelsContext = createContext<BlockKitLabels>(DEFAULT_BLOCK_KIT_LABELS);

export const useBlockKitLabels = (): BlockKitLabels => useContext(BlockKitLabelsContext);
