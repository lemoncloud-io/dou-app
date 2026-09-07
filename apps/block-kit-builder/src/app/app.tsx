import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import { PayloadPane, PreviewPane, blocksToPayloadJson } from './features';
import { BuilderLayout } from './layout';

// A fixed starting payload until slice 05 makes the rail write to a store. Goes
// through `toBlocks` like anything else the app draws, so the seed cannot be a
// shape a real message could not carry.
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

const Empty = ({ children }: { children: string }) => (
    <p className="px-4 py-2 text-callout text-muted-foreground">{children}</p>
);

export const App = () => {
    const json = blocksToPayloadJson(SEED);

    return (
        <BuilderLayout
            rail={<Empty>The palette lands in the next slice.</Empty>}
            preview={<PreviewPane blocks={SEED} raw={json} />}
            payload={<PayloadPane json={json} />}
        />
    );
};
