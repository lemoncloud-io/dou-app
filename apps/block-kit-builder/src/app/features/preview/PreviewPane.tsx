import { BlockKitMessage, type KnownBlock } from '@chatic/block-kit';

interface PreviewPaneProps {
    blocks: KnownBlock[];
    /** The message body a channel would carry — what shows when no block draws. */
    raw: string;
}

/** Fixed so the preview is stable to compare against; the builder has no clock. */
const SENDER = { name: '릴리즈봇', initial: 'R', time: '오후 11:11' };

/**
 * The message as a channel draws it.
 *
 * `BlockKitMessage` is imported, not reimplemented — a second renderer would
 * drift from desktop-web and the preview would start lying, which is the one
 * thing it exists to rule out.
 *
 * The bubble around it is a stand-in: avatar, name, time. desktop-web's
 * `MessageRow` also carries hover actions, reactions, read receipts and a thread
 * footer, none of which mean anything for a payload that was never sent.
 */
export const PreviewPane = ({ blocks, raw }: PreviewPaneProps) => (
    <div className="px-4 py-2">
        <div className="flex gap-3 rounded-md px-2 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-caption font-semibold text-foreground">
                {SENDER.initial}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-heading text-foreground">{SENDER.name}</span>
                    <span className="text-caption tabular-nums text-muted-foreground">{SENDER.time}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <BlockKitMessage blocks={blocks} raw={raw} />
                </div>
            </div>
        </div>
    </div>
);
