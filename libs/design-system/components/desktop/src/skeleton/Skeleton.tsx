import type { CSSProperties } from 'react';

import { cn } from '@chatic/ui-kit';

interface SkeletonProps {
    className?: string;
    style?: CSSProperties;
}

export const Skeleton = ({ className, style }: SkeletonProps) => (
    <div
        style={style}
        className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
        aria-hidden="true"
    />
);
