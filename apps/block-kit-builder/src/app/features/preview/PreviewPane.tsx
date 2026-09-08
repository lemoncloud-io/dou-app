import { BlockKitMessage, type KnownBlock } from '@chatic/block-kit';

import { DEVICE_WIDTH, type PreviewDevice } from './DeviceToggle';

interface PreviewPaneProps {
    blocks: KnownBlock[];
    /** The message body a channel would carry — what shows when no block draws. */
    raw: string;
    /** Which client's width to draw the card at. */
    device: PreviewDevice;
}

/** Fixed so the preview is stable to compare against; the builder has no clock. */
const SENDER = { name: '릴리즈봇', initial: 'R', time: '오후 11:11' };

/**
 * The message as a channel draws it, on a stage.
 *
 * `BlockKitMessage` is imported, not reimplemented — a second renderer would
 * drift from desktop-web and the preview would start lying, which is the one
 * thing it exists to rule out.
 *
 * The card is width-clamped to a real client rather than filling the pane. A
 * message stretched across a 700px column is not a message anyone will see, and
 * the two things this preview is judged on — where the text wraps and how tall
 * the card gets — are both functions of that width.
 *
 * The bubble around it is a stand-in: avatar, name, time. desktop-web's
 * `MessageRow` also carries hover actions, reactions, read receipts and a thread
 * footer, none of which mean anything for a payload that was never sent.
 */
export const PreviewPane = ({ blocks, raw, device }: PreviewPaneProps) => {
    // An empty message has no card. `BlockKitMessage` falls back to the raw body
    // when nothing is drawable, which for no blocks at all is the empty payload —
    // a card showing `{"blocks": []}` under a sender's name reads as a message that
    // was sent, not as one that has not been written.
    if (!blocks.length) {
        return (
            <div className="flex h-full items-center justify-center bg-well px-6 py-10">
                <p className="max-w-64 text-balance text-center text-caption text-muted-foreground">
                    Nothing to preview yet. Pick a template or add a block, and the message appears here.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-well">
            <div className="flex min-h-full justify-center px-4 py-6 lg:px-8 lg:py-8">
                <div
                    // The one `bg-background` surface on the screen. Everything the tool
                    // adds sits on the well, so the message is the figure and the
                    // controls are the ground without a label saying which is which.
                    className="h-fit w-full rounded-lg border border-hairline bg-background px-3 py-3 shadow-raised transition-[max-width] duration-200 ease-tactile"
                    style={{ maxWidth: DEVICE_WIDTH[device] }}
                >
                    <div className="flex gap-3">
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
            </div>
        </div>
    );
};
