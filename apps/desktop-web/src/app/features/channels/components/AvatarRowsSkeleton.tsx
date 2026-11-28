import { Skeleton } from '@chatic/design-system-components-desktop';

interface AvatarRowsSkeletonProps {
    label: string;
    rows?: number;
}

export const AvatarRowsSkeleton = ({ label, rows = 4 }: AvatarRowsSkeletonProps) => (
    <div className="flex flex-col gap-0.5" role="status" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className={i % 2 === 0 ? 'h-3.5 w-32' : 'h-3.5 w-24'} />
            </div>
        ))}
    </div>
);
