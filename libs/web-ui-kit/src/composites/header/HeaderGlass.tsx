import { useEffect, useState } from 'react';

import { cn } from '@chatic/lib/utils';

/** How long the frost takes to reach full strength. Long enough to read as a fade, short enough
 *  that the header is settled before anyone has finished looking at it. */
const FADE_MS = 300;

/**
 * Frame callbacks do not run while the document is hidden — a backgrounded tab, or a WebView the
 * OS has covered — so a header that mounts there would sit at zero frost until the document came
 * back. The timer keeps running (throttled), so it settles the layer regardless; nothing is being
 * painted meanwhile, so skipping the fade there costs nothing.
 */
const FADE_FALLBACK_MS = 100;

/**
 * The frosted pane behind a glass header, faded in over its first moments rather than switched on.
 *
 * Without this the frost arrives in a single frame, and on entering a room that lands as a visible
 * snap: WebKit sizes the backdrop layer on a later composite than the one that paints the box, so
 * the safe-area strip in particular stayed unfrosted for a beat while the rest of the header was
 * already glass. Fading covers whatever moment the compositor picks — it reads as the header
 * settling in rather than as a glitch.
 *
 * It is `opacity` that animates, NOT the blur radius. WebKit interpolates backdrop-filter poorly
 * and often snaps straight to the end value, which would reproduce the very pop this exists to
 * remove; opacity is compositor-animated everywhere. Cross-fading a fully blurred pane from
 * transparent gives the same read — the backdrop resolves from sharp to frosted — through a
 * property that is actually reliable to animate.
 *
 * The pane carries only the blur. Callers keep their own fill on the header itself so it is opaque
 * enough to read from the first frame; fading that too would leave the title over raw message text.
 *
 * Render it as the first child of a `relative` header, and give the header's content wrapper
 * `relative` so it paints above this.
 */
export const HeaderGlass = ({ className }: { className?: string }) => {
    const [frosted, setFrosted] = useState(false);

    useEffect(() => {
        const settle = () => setFrosted(true);
        // The frame matters: flipping the flag straight away can be batched into the same paint as
        // the mount, leaving no transparent frame for the fade to start from.
        const frame = requestAnimationFrame(settle);
        const timer = setTimeout(settle, FADE_FALLBACK_MS);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, []);

    return (
        <div
            aria-hidden
            style={{ transitionDuration: `${FADE_MS}ms` }}
            className={cn(
                'pointer-events-none absolute inset-0 backdrop-blur-xl',
                'transition-opacity ease-out [will-change:opacity] motion-reduce:transition-none',
                frosted ? 'opacity-100' : 'opacity-0',
                className
            )}
        />
    );
};
