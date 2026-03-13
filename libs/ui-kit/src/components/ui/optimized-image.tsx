import * as React from 'react';

import { cn } from '@chatic/lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fallback?: string;
}

/**
 * OptimizedImage component with built-in lazy loading and error handling.
 * Use this for images that are not immediately visible (below the fold).
 */
export const OptimizedImage = React.forwardRef<HTMLImageElement, OptimizedImageProps>(
    ({ className, src, alt, fallback, onError, ...props }, ref) => {
        const [error, setError] = React.useState(false);

        const handleError = React.useCallback(
            (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                setError(true);
                onError?.(e);
            },
            [onError]
        );

        return (
            <img
                ref={ref}
                src={error && fallback ? fallback : src}
                alt={alt}
                loading="lazy"
                decoding="async"
                onError={handleError}
                className={cn('transition-opacity duration-300', className)}
                {...props}
            />
        );
    }
);

OptimizedImage.displayName = 'OptimizedImage';
