import { useEffect } from 'react';

import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import { BuilderRail, PayloadPane, PreviewPane, blocksToPayloadJson } from './features';
import { BuilderLayout } from './layout';
import { useBuilderStore } from './store';

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

export const App = () => {
    const blocks = useBuilderStore(state => state.blocks);

    // Seed once, and only into an empty store — a later slice restores saved work,
    // and overwriting that on every mount would throw the reader's message away.
    useEffect(() => {
        if (!useBuilderStore.getState().blocks.length) useBuilderStore.getState().setBlocks(SEED);
    }, []);

    const json = blocksToPayloadJson(blocks);

    return (
        <BuilderLayout
            rail={<BuilderRail />}
            preview={<PreviewPane blocks={blocks} raw={json} />}
            payload={<PayloadPane json={json} />}
        />
    );
};
