import { SLIDE_MS, slideEase } from '@chatic/web-ui-kit';

export interface SlotSlideHooks {
    /**
     * Draws one position of the slide — 0 with the attach panel below its place, 1 with it in place —
     * on everything the slide moves, in one call. Each frame of a slide is one call, so whatever this
     * writes lands in the same frame.
     */
    draw: (position: number) => void;
    /** A slide has started moving things from rest. Not called when a slide turns into another one. */
    onStart?: () => void;
    /** Movement has stopped: the slide arrived, or a jump cut it short. Pairs with `onStart`. */
    onStop?: () => void;
    /** A slide reached the position it was going to. A slide turned around, or cut short, never does. */
    onArrive?: (position: number) => void;
}

export interface SlotSlide {
    /** Where the slot is now, 0…1 — part-way through a slide, where that slide has got to. */
    readonly position: number;
    /** Whether a slide is under way. */
    readonly sliding: boolean;
    /**
     * Slides from wherever the slot is to `to`, on the photo screens' curve. A slide still under way is
     * turned around from where it has got to, not restarted from either end, and takes the share of
     * `SLIDE_MS` its remaining distance is of the whole. The first position is drawn before this
     * returns, so nothing in between is painted.
     */
    slide: (to: number) => void;
    /**
     * Puts the slot at `to` with no slide, stopping one under way where it stands. Draws nothing: what an
     * instant change shows is the caller's to draw.
     */
    jump: (to: number) => void;
    /** Stops for good, drawing and reporting nothing more. */
    dispose: () => void;
}

/**
 * The one frame loop that moves the attach panel and the composer together. Each frame works out one
 * position from the time elapsed and hands it to `draw`, which writes the panel's translate and the
 * composer's offset from it: two things a CSS transition each would start on different frames — on iOS
 * WebKit the panel's transform runs on the compositor at once and the composer's padding, laid out on
 * the main thread, a frame behind.
 *
 * Frames come from `requestAnimationFrame` and are timed by its timestamp, against the moment the slide
 * was asked for: a slide asked for mid-frame starts with that frame, as a transition would.
 */
export const createSlotSlide = ({ draw, onStart, onStop, onArrive }: SlotSlideHooks, initial = 0): SlotSlide => {
    let position = initial;
    let from = initial;
    let to = initial;
    let startedAt = 0;
    let duration = 0;
    let frame: number | null = null;
    let disposed = false;

    const cancelFrame = () => {
        if (frame === null) return;
        cancelAnimationFrame(frame);
        frame = null;
    };

    const step = (now: number) => {
        frame = null;
        if (disposed) return;
        const elapsed = duration > 0 ? (now - startedAt) / duration : 1;
        if (elapsed < 1) {
            position = from + (to - from) * slideEase(Math.max(0, elapsed));
            draw(position);
            frame = requestAnimationFrame(step);
            return;
        }
        // Exactly the end, not the sum the curve comes to: the resting place is a plain 0 or 1.
        position = to;
        draw(position);
        onStop?.();
        onArrive?.(position);
    };

    return {
        get position() {
            return position;
        },
        get sliding() {
            return frame !== null;
        },
        slide: target => {
            if (disposed) return;
            const wasSliding = frame !== null;
            cancelFrame();
            from = position;
            to = target;
            duration = SLIDE_MS * Math.abs(to - from);
            if (duration === 0) {
                // Already there: nothing moves, and a slide that was heading elsewhere ends here.
                if (wasSliding) onStop?.();
                onArrive?.(position);
                return;
            }
            startedAt = performance.now();
            if (!wasSliding) onStart?.();
            draw(position);
            frame = requestAnimationFrame(step);
        },
        jump: target => {
            if (disposed) return;
            const wasSliding = frame !== null;
            cancelFrame();
            position = target;
            if (wasSliding) onStop?.();
        },
        dispose: () => {
            disposed = true;
            cancelFrame();
        },
    };
};
