import { useEffect, useState } from 'react';

import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import {
    BuilderRail,
    DeviceToggle,
    HistoryControls,
    PayloadPane,
    PreviewPane,
    blocksToPayloadJson,
    type PayloadParseFailure,
    type PreviewDevice,
} from './features';
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
    // Which width the preview draws at. Deliberately outside the store: it is not
    // part of the message, so it must not land in the undo stack or be persisted
    // alongside a payload it says nothing about.
    const [device, setDevice] = useState<PreviewDevice>('desktop');
    // Why the card is behind the payload pane. Held here because two panes need
    // it: the editor marks the line, the preview says what happened. Neither owns
    // the other, so the thing they share sits above both.
    const [failure, setFailure] = useState<PayloadParseFailure | null>(null);

    // The store decides whether this builder has ever held a message; `seed` is a
    // no-op once it has. Waiting for hydration first, or the check runs against
    // the empty initial state and the example lands on top of saved work.
    useEffect(() => {
        if (useBuilderStore.persist.hasHydrated()) useBuilderStore.getState().seed(SEED);
    }, []);

    const json = blocksToPayloadJson(blocks);

    return (
        <BuilderLayout
            rail={<BuilderRail />}
            preview={<PreviewPane blocks={blocks} raw={json} device={device} failure={failure} />}
            previewActions={
                <div className="flex items-center gap-2">
                    {/* Nothing to choose below `lg`: the pane is already narrower
                        than the mobile clamp, so both settings draw the same card. */}
                    <span className="hidden items-center gap-2 lg:flex">
                        <DeviceToggle value={device} onValue={setDevice} />
                        <span aria-hidden className="h-4 w-px bg-hairline" />
                    </span>
                    <HistoryControls />
                </div>
            }
            payload={<PayloadPane json={json} onBlocks={useBuilderStore.getState().setBlocks} onError={setFailure} />}
        />
    );
};
