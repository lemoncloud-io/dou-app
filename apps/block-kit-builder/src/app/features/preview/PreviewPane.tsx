import { AlertTriangle } from 'lucide-react';

import { BlockKitMessage, type KnownBlock } from '@chatic/block-kit';

import type { PayloadParseFailure } from '../payload';
import { DEVICE_WIDTH, type PreviewDevice } from './DeviceToggle';

interface PreviewPaneProps {
    blocks: KnownBlock[];
    /** The message body a channel would carry — what shows when no block draws. */
    raw: string;
    /** Which client's width to draw the card at. */
    device: PreviewDevice;
    /** Why this card is behind the payload pane, or null when it is current. */
    failure: PayloadParseFailure | null;
}

/**
 * Why the card below is not what the payload pane says.
 *
 * Over the message, not over the editor: the reader can already see the JSON
 * they typed, and the thing that needs explaining is the card that stopped
 * agreeing with it. Naming the line is not enough on its own — the gutter marks
 * it too, so the number here is a description of where to look rather than a
 * coordinate to count out by hand.
 */
const StaleNotice = ({ failure }: { failure: PayloadParseFailure }) => (
    <div
        role="status"
        className="mb-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5"
    >
        <AlertTriangle size={15} className="mt-px shrink-0 text-destructive" />
        <p className="text-caption text-foreground">
            {/* The parser's own wording, ended for it — V8 hands back a fragment
                with no full stop, and the sentence after it needs one to start. */}
            {failure.error}
            {failure.line !== undefined && <span className="text-muted-foreground"> on line {failure.line}</span>}.{' '}
            <span className="text-muted-foreground">Showing the last payload that parsed.</span>
        </p>
    </div>
);

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
 *
 * The card sits on a lit stage rather than directly on the well, per the design:
 * the stage stands for the channel the message would arrive in, so the card is
 * judged against a surface the width of a conversation rather than against the
 * tool's own background. The card stays the figure by its border and shadow
 * instead of by surface contrast — the stage is `elevated` rather than
 * `background` because in the dark theme `--background` and `--well` are one
 * percent of lightness apart and a stage drawn in it would not be visible at all.
 */
export const PreviewPane = ({ blocks, raw, device, failure }: PreviewPaneProps) => (
    <div className="h-full overflow-auto bg-well p-3 lg:p-5">
        <div className="flex min-h-full justify-center rounded-xl bg-elevated px-4 py-6 lg:px-8 lg:py-10">
            {/* The notice is clamped to the same width as the card so the two share
                an edge. A full-bleed banner over a 390px card would be a wider
                thing than the thing it is about. */}
            <div
                className="flex h-fit w-full flex-col transition-[max-width] duration-200 ease-tactile"
                style={{ maxWidth: DEVICE_WIDTH[device] }}
            >
                {failure && <StaleNotice failure={failure} />}

                {/* An empty message has no card. `BlockKitMessage` falls back to the
                    raw body when nothing is drawable, which for no blocks at all is
                    the empty payload — a card showing `{"blocks": []}` under a
                    sender's name reads as a message that was sent, not as one that
                    has not been written. */}
                {blocks.length ? (
                    <div
                        // Figure against the stage by edge and elevation rather than by
                        // fill: the stage is the same surface family, so a card that
                        // relied on being the lighter one would vanish on it.
                        className="rounded-lg border border-hairline bg-background px-3 py-3 shadow-raised"
                    >
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
                                    <BlockKitMessage blocks={blocks} raw={raw} />
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
