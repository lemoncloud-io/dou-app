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
 * ## The two panes
 *
 * Fading the frost in leaves a window where there is no frost, and a glass header's own fill is
 * only 32% opaque — by design, because the point of the treatment is that content shows through
 * it. During that window the other 68% is raw message text under the title, which is what "the
 * header renders late" looks like from the outside. It is not late; it is unfrosted, and only
 * WebKit holds the window open long enough to notice.
 *
 * So the frost does not fade in over nothing. An opaque pane is painted first and fades OUT on the
 * same clock, and the two cross over: at every moment the header is backed by frost, by the opaque
 * pane, or by a mix of the two that still adds to a readable surface. The header is legible from
 * its first frame, and the treatment resolves into glass instead of arriving.
 *
 * Order matters — the opaque pane is rendered first so the frost paints over it, not under it.
 * Both are below the header's content, which the caller marks `relative` for exactly that reason.
 *
 * The caller keeps its own translucent fill on the header element. That fill is the END state and
 * is not animated; these two panes are only the arrival.
 *
 * Render them as the first children of a `relative` header, and give the header's content wrapper
 * `relative` so it paints above both.
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

    const fade = 'transition-opacity ease-out [will-change:opacity] motion-reduce:transition-none';

    return (
        <>
            {/* Stand-in surface for the frost that has not composited yet. `bg-surface` is the
                app's own header ground, so the cross-fade changes how much shows through rather
                than what colour the header is. */}
            <div
                aria-hidden
                data-testid="header-glass-warmup"
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={cn(
                    'pointer-events-none absolute inset-0 bg-surface',
                    fade,
                    frosted ? 'opacity-0' : 'opacity-100'
                )}
            />
            <div
                aria-hidden
                data-testid="header-glass-frost"
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={cn(
                    'pointer-events-none absolute inset-0 backdrop-blur-xl',
                    fade,
                    frosted ? 'opacity-100' : 'opacity-0',
                    className
                )}
            />
        </>
    );
};
