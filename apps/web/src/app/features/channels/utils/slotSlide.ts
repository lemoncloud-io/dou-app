import { SLIDE_MS, slideEase } from '@chatic/web-ui-kit';

export interface SlotSlideHooks {
    draw: (position: number) => void;
    onStart?: () => void;
    onStop?: () => void;
    onArrive?: (position: number) => void;
}

export interface SlotSlide {
    readonly position: number;
    readonly sliding: boolean;
    slide: (to: number) => void;
    jump: (to: number) => void;
    dispose: () => void;
}

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
