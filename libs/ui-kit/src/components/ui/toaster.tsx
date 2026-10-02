import { type CSSProperties, useLayoutEffect, useRef } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';

import { cn } from '../../utils';
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

/**
 * How long a toast stays. 1.5s was under the time it takes to read one sentence, so a
 * confirmation ("Channel created", or "Member removed" with its Undo) was gone before
 * anyone could act on it, or even notice it had fired. A swipe still dismisses it early.
 */
export const TOAST_DURATION_MS = 5000;

/**
 * How far above the bottom edge the snackbar rests: 16px clear of whichever is taller, the
 * home-indicator inset or the soft keyboard, plus `--toast-lift` — the height of any bar a
 * screen keeps pinned to the bottom, which the bar publishes itself through `useToastLift`
 * because this toaster is mounted above the router and cannot know what is showing. All three
 * variables fall back to 0px, so a plain browser gets a 16px gap.
 *
 * It is a variable rather than a padding value because the enter and exit keyframes read
 * it too: sliding by the toast's own height alone would start and end the slide with the
 * toast still on screen, `offset` short of the edge.
 */
export const SNACKBAR_OFFSET =
    'calc(max(var(--safe-bottom, 0px), var(--keyboard-height, 0px)) + var(--toast-lift, 0px) + 16px)';

/** Every bar on screen that asked for a lift, by owner. */
const lifts = new Map<symbol, number>();

const publishLift = () => {
    const tallest = Math.max(0, ...lifts.values());
    const root = document.documentElement;
    if (tallest > 0) root.style.setProperty('--toast-lift', `${tallest}px`);
    else root.style.removeProperty('--toast-lift');
};

/**
 * Lifts the snackbar `px` above its offset while the caller is mounted — the hook a bar pinned to
 * the bottom calls with its own height. `null` (or 0) asks for nothing.
 *
 * One registry rather than each bar writing `--toast-lift` itself: bars come and go out of order
 * (a dialog's CTA opens over the tab bar, the tab bar steps aside for the keyboard while the CTA
 * stays), and a bar that put back the value it found would restore a lift for a bar that is gone.
 * The tallest active lift wins, since that is the bar the toast has to clear.
 *
 * A layout effect, so a toast raised in the same commit that shows the bar is already lifted.
 */
export const useToastLift = (px: number | null) => {
    const owner = useRef<symbol | null>(null);
    owner.current ??= Symbol('toast-lift');

    useLayoutEffect(() => {
        if (!px || px <= 0) return;
        const key = owner.current as symbol;
        lifts.set(key, px);
        publishLift();
        return () => {
            lifts.delete(key);
            publishLift();
        };
    }, [px]);
};

const VIEWPORT_STYLE = {
    '--snackbar-offset': SNACKBAR_OFFSET,
    paddingBottom: 'var(--snackbar-offset)',
} as CSSProperties;

interface ToasterProps {
    /** Extra classes for the viewport, merged over its bottom anchoring. */
    viewportClassName?: string;
    /**
     * The toast region's accessible name, in the host's language. Radix's default is the
     * English "Notifications ({hotkey})"; `{hotkey}` is replaced with the shortcut that
     * moves focus into the region.
     */
    label: string;
}

const ICONS = {
    default: <Check className="size-[22px] shrink-0 text-primary" strokeWidth={2.5} aria-hidden />,
    destructive: <AlertCircle className="size-[22px] shrink-0 text-destructive" aria-hidden />,
    // A notice that is neither a success nor a failure ("that message is not
    // loaded") must not wear the success check.
    info: <Info className="size-[22px] shrink-0 text-toast-muted" aria-hidden />,
};

/**
 * The mobile web app's snackbar: a bottom-anchored bar that slides up into place, slides
 * back down when its timer runs out, and can be swiped down to dismiss early.
 *
 * Swipe and exit are one motion. The exit keyframe starts from the swipe's release point
 * (`--radix-toast-swipe-end-y`, unset — so 0 — when the timer closes it), so a swiped
 * toast carries on downward instead of snapping back to its rest position first. A swipe
 * short of Radix's 50px threshold is cancelled and the `transition` eases it back.
 *
 * `touch-none` is what lets the swipe work in a WebView at all: without it the browser
 * claims a vertical drag as a scroll, cancels the pointer stream, and Radix never sees the
 * gesture finish.
 */
export const Toaster = ({ viewportClassName, label }: ToasterProps) => {
    const { toasts } = useToast();

    return (
        <ToastProvider duration={TOAST_DURATION_MS} swipeDirection="down">
            {toasts.map(({ id, title, description, action, variant, className, ...props }) => {
                return (
                    <Toast
                        key={id}
                        variant={variant}
                        className={cn(
                            'touch-none items-center gap-[9px] rounded-[8px] border-l-0 px-4 py-[13px]',
                            'shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)]',
                            'data-[state=open]:animate-snackbar-in data-[state=closed]:animate-snackbar-out',
                            // Stated per state: a bare `motion-reduce:animate-none` is one attribute
                            // selector short of the state rules and never wins.
                            'motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none',
                            className
                        )}
                        {...props}
                    >
                        {ICONS[variant ?? 'default']}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {title && <ToastTitle className="leading-normal">{title}</ToastTitle>}
                            {description && <ToastDescription>{description}</ToastDescription>}
                        </div>
                        {action}
                    </Toast>
                );
            })}
            <ToastViewport
                // The transition eases a showing toast up or down when a bar's lift comes or goes
                // under it, instead of jumping 80px.
                className={cn(
                    'bottom-0 top-auto transition-[padding-bottom] duration-200 motion-reduce:transition-none',
                    viewportClassName
                )}
                style={VIEWPORT_STYLE}
                label={label}
            />
        </ToastProvider>
    );
};
