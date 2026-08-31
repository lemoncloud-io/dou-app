import { Skeleton } from '../../../shared';

interface AvatarRowsSkeletonProps {
    /** Accessible label for the loading region (the list this stands in for). */
    label: string;
    rows?: number;
}

/**
 * Placeholder for any avatar + name list while it loads — the member roster and the
 * add-members picker both render one, so the shape lives here rather than twice.
 */
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
