import { Skeleton } from './Skeleton';

/**
 * Full Slack-style shell placeholder shown during app boot / route suspense for
 * authenticated sessions. Mirrors DesktopLayout (rail · sidebar · main) so the
 * real UI fades in over the same skeleton instead of after a blank screen.
 */
export const AppShellSkeleton = () => (
    <div className="flex h-screen bg-background" role="status" aria-label="Loading">
        {/* cloud rail */}
        <div className="flex w-[68px] shrink-0 flex-col items-center gap-3 bg-rail py-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 w-11 animate-pulse rounded-2xl bg-rail-muted motion-reduce:animate-none" />
            ))}
        </div>

        {/* sidebar */}
        <div className="flex w-64 shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <div className="mt-2 flex flex-col gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-7" />
                ))}
            </div>
        </div>

        {/* main */}
        <div className="flex flex-1 flex-col">
            <div className="flex h-14 items-center gap-2 border-b border-border px-4">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex flex-1 flex-col gap-5 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                        <div className="flex flex-1 flex-col gap-2 pt-1">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);
