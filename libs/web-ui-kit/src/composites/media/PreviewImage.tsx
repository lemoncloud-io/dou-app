import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface PreviewImageProps {
    /** A preview the browser can draw; empty for an item that has none, which stays a plain tile. */
    src: string;
    className?: string;
}

/**
 * A photo preview that fills its tile, with a pulsing skeleton under it until the image has decoded.
 * Without one, a tile shows nothing for the moment a base64 preview takes to decode, then the photo
 * pops in. Instead the two cross-fade: the skeleton fades out as the image fades in, over 300ms. Both
 * stay instant for someone who asked the system for less motion.
 *
 * The skeleton is for the first load of this element only. A tile handed a sharper copy of the same
 * photo (a pinch to fewer columns) keeps showing the one it has until the new one is in, rather than
 * blinking back to a skeleton; a different photo gets a new element. An image the browser already
 * holds decoded — a tile scrolled back into view — shows at once, without the fade. A preview that
 * fails to decode stops pulsing: a skeleton would promise an image that is not coming.
 *
 * Positions itself in the parent, which must be `relative` and clip its corners. An empty `src` draws
 * nothing at all: the item has no preview.
 */
export const PreviewImage = ({ src, className }: PreviewImageProps) => {
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const [shown, setShown] = React.useState(false);
    const [instant, setInstant] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    // Before paint: an image already decoded needs no skeleton and no fade.
    React.useLayoutEffect(() => {
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) {
            setInstant(true);
            setShown(true);
        }
    }, []);

    if (!src) return null;
    const fade = instant ? '' : 'transition-opacity duration-300 motion-reduce:transition-none';
    return (
        <>
            {/* Kept mounted once the image is in, so it can fade out rather than vanish. */}
            <span
                aria-hidden
                data-testid="preview-skeleton"
                data-loaded={shown}
                className={cn(
                    'absolute inset-0 bg-muted',
                    fade,
                    shown ? 'opacity-0' : !failed && 'motion-safe:animate-pulse'
                )}
            />
            <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={() => setShown(true)}
                onError={() => setFailed(true)}
                className={cn('relative size-full object-cover', fade, shown ? 'opacity-100' : 'opacity-0', className)}
            />
        </>
    );
};
