import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface PreviewImageProps {
    src: string;
    className?: string;
}

export const PreviewImage = ({ src, className }: PreviewImageProps) => {
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const [shown, setShown] = React.useState(false);
    const [instant, setInstant] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

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
