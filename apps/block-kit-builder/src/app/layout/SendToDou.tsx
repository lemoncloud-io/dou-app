import { toast } from 'sonner';

import { cn } from '@chatic/lib/utils';

/**
 * The design's primary action, and the one thing on this screen that would
 * leave the browser.
 *
 * TODO: post the payload once there is somewhere to post it. The builder has no
 * send endpoint — the same gap that keeps `actions` blocks out of the palette,
 * since a button in a channel has nowhere to report a press either. Wiring this
 * needs a webhook the builder is allowed to call and a channel to name; until
 * then the button says so rather than pretending.
 *
 * It is drawn anyway, because the alternative teaches the wrong shape: this is
 * where the action goes, and a tool whose primary action appears only after the
 * backend does is a tool nobody has laid out for it.
 */
export const SendToDou = () => (
    <button
        type="button"
        onClick={() =>
            toast('Send to DoU is not connected yet', {
                description: 'Copy the payload and post it from your bot for now.',
            })
        }
        className={cn(
            'focus-ring tactile shrink-0 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold',
            'text-primary-foreground transition-colors ease-tactile hover:bg-primary/90 lg:px-4 lg:py-2'
        )}
    >
        Send to DoU
    </button>
);
