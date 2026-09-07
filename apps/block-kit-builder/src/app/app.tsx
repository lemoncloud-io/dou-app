import { useEffect } from 'react';

import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import { BuilderRail, HistoryControls, PayloadPane, PreviewPane, blocksToPayloadJson } from './features';
import { BuilderLayout } from './layout';
import { BUILDER_STORAGE_KEY, useBuilderStore } from './store';

// What an empty builder opens on. Goes through `toBlocks` like anything else the
// app draws, so the starting point cannot be a shape a real message could not carry.
const SEED: KnownBlock[] = toBlocks([
    { type: 'header', text: { type: 'plain_text', text: '🟠 error-report: carrot-pools2-api' } },
    { type: 'section', text: { type: 'mrkdwn', text: '*503 Service Unavailable* — ECONNRESET' } },
    { type: 'divider' },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'lemon-production' },
            { type: 'mrkdwn', text: 'v1.25.1201' },
        ],
    },
]);

/**
 * Has this browser ever stored a message? Reading the key directly rather than
 * asking the store, because "no blocks" and "never opened the app" are the same
 * state to it and they call for opposite behaviour.
 */
const isFirstVisit = (): boolean => {
    try {
        return localStorage.getItem(BUILDER_STORAGE_KEY) === null;
    } catch {
        // Private mode, or storage blocked. Nothing was saved, so the example applies.
        return true;
    }
};

export const App = () => {
    const blocks = useBuilderStore(state => state.blocks);

    // Seed only a builder that has never been used. Testing for an empty block
    // list instead would undo a deliberate Clear on the next reload: the reader
    // emptied the message, and the app would hand the example back.
    useEffect(() => {
        if (!useBuilderStore.persist.hasHydrated()) return;
        if (isFirstVisit()) useBuilderStore.getState().setBlocks(SEED);
    }, []);

    const json = blocksToPayloadJson(blocks);

    return (
        <BuilderLayout
            rail={<BuilderRail />}
            preview={<PreviewPane blocks={blocks} raw={json} />}
            previewActions={<HistoryControls />}
            payload={<PayloadPane json={json} onBlocks={useBuilderStore.getState().setBlocks} />}
        />
    );
};
