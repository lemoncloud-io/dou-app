import { AlertTriangle } from 'lucide-react';

import { BlockKitMessage, hasDrawableBlocks, takeSourceLink, type KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/ui-kit';

import type { PayloadParseFailure } from '../payload';
import { DEVICE_WIDTH, type PreviewDevice } from './DeviceToggle';
import { SourceFields, toCardSource, type PreviewSource } from './SourceFields';

interface PreviewPaneProps {
    blocks: KnownBlock[];
    raw: string;
    device: PreviewDevice;
    failure: PayloadParseFailure | null;
    source: PreviewSource;
    onSource: (source: PreviewSource) => void;
}

const StaleNotice = ({ failure }: { failure: PayloadParseFailure }) => (
    <div
        role="status"
        className="mb-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5"
    >
        <AlertTriangle size={15} className="mt-px shrink-0 text-destructive" />
        <p className="text-caption text-foreground">
            {failure.error}
            {failure.line !== undefined && <span className="text-muted-foreground"> on line {failure.line}</span>}.{' '}
            <span className="text-muted-foreground">Showing the last payload that parsed.</span>
        </p>
    </div>
);

const PreviewMessage = ({
    blocks,
    raw,
    device,
    source,
}: Pick<PreviewPaneProps, 'blocks' | 'raw' | 'device' | 'source'>) => {
    const cardSource = toCardSource(source);
    const { blocks: drawn, sourceUrl } = takeSourceLink(blocks, cardSource);
    const framed = hasDrawableBlocks(blocks);
    return (
        <div
            className={cn(
                framed && 'min-w-0 max-w-full rounded-[10px] border border-hairline bg-card',
                framed && (device === 'desktop' ? 'w-fit p-6' : 'p-4')
            )}
        >
            <BlockKitMessage
                blocks={framed ? drawn : blocks}
                raw={raw}
                scale={device === 'desktop' ? 'desktop' : 'phone'}
                sourceUrl={framed ? sourceUrl : undefined}
                source={framed ? cardSource : undefined}
            />
        </div>
    );
};

const SENDER = { name: 'ReleaseBot', initial: 'R', time: '11:11 PM' };

export const PreviewPane = ({ blocks, raw, device, failure, source, onSource }: PreviewPaneProps) => (
    <div className="h-full overflow-auto bg-well p-3 lg:p-5">
        <div className="flex min-h-full justify-center rounded-xl bg-elevated px-4 py-6 lg:px-8 lg:py-10">
            <div
                className="flex h-fit w-full flex-col transition-[max-width] duration-200 ease-tactile"
                style={{ maxWidth: DEVICE_WIDTH[device] }}
            >
                <SourceFields value={source} onValue={onSource} />
                {failure && <StaleNotice failure={failure} />}

                {blocks.length ? (
                    <div className="rounded-lg border border-hairline bg-background px-3 py-3 shadow-raised">
                        <div className="flex gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold text-foreground">
                                {SENDER.initial}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="truncate text-heading text-foreground">{SENDER.name}</span>
                                    <span className="text-caption tabular-nums text-muted-foreground">
                                        {SENDER.time}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <PreviewMessage blocks={blocks} raw={raw} device={device} source={source} />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-balance py-10 text-center text-caption text-muted-foreground">
                        Nothing to preview yet. Pick a template or add a block, and the message appears here.
                    </p>
                )}
            </div>
        </div>
    </div>
);
