import { useEffect, useState } from 'react';

import { toBlocks, type KnownBlock } from '@chatic/block-kit';

import {
    BuilderRail,
    CopyPayloadButton,
    DeviceToggle,
    HistoryControls,
    IncomingTemplateBar,
    PayloadPane,
    PreviewPane,
    EMPTY_PREVIEW_SOURCE,
    blocksToPayloadJson,
    readIncomingCard,
    type PayloadParseFailure,
    type PreviewDevice,
    type PreviewSource,
} from './features';
import { BuilderLayout } from './layout';
import { useBuilderStore } from './store';

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

const INCOMING = readIncomingCard(window.location.search, window.location.hash);

export const App = () => {
    const blocks = useBuilderStore(state => state.blocks);
    const [device, setDevice] = useState<PreviewDevice>('desktop');
    const [failure, setFailure] = useState<PayloadParseFailure | null>(null);
    const [source, setSource] = useState<PreviewSource>(INCOMING?.source ?? EMPTY_PREVIEW_SOURCE);

    useEffect(() => {
        if (!useBuilderStore.persist.hasHydrated()) return;
        if (INCOMING) useBuilderStore.getState().setBlocks(INCOMING.blocks);
        else useBuilderStore.getState().seed(SEED);
    }, []);

    const json = blocksToPayloadJson(blocks);

    return (
        <BuilderLayout
            rail={<BuilderRail />}
            preview={
                <PreviewPane
                    blocks={blocks}
                    raw={json}
                    device={device}
                    failure={failure}
                    source={source}
                    onSource={setSource}
                />
            }
            previewActions={
                <div className="flex items-center gap-2">
                    {INCOMING && (
                        <>
                            <IncomingTemplateBar templateId={INCOMING.templateId} />
                            <span aria-hidden className="h-4 w-px bg-hairline" />
                        </>
                    )}
                    <span className="hidden items-center gap-2 lg:flex">
                        <DeviceToggle value={device} onValue={setDevice} />
                        <span aria-hidden className="h-4 w-px bg-hairline" />
                    </span>
                    <HistoryControls />
                </div>
            }
            payload={<PayloadPane json={json} onBlocks={useBuilderStore.getState().setBlocks} onError={setFailure} />}
            payloadActions={<CopyPayloadButton json={json} />}
        />
    );
};
