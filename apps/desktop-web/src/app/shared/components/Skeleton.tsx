import type { CSSProperties } from 'react';

import { cn } from '@chatic/lib/utils';

interface SkeletonProps {
    className?: string;
    style?: CSSProperties;
}

/**
 * Shimmer placeholder block. Reserves layout space while content loads (avoids
 * CLS) and pulses to signal activity. Honors prefers-reduced-motion.
 */
export const Skeleton = ({ className, style }: SkeletonProps) => (
    <div
        style={style}
        className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
        aria-hidden="true"
    />
);
