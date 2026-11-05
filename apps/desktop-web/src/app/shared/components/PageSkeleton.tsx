import { useTranslation } from 'react-i18next';

import { Skeleton } from './Skeleton';

/**
 * Placeholder for the me-pages (Settings, Profile, Account and its sub-pages, place settings).
 * Mirrors `PageShell` — header bar, then a centred `max-w-2xl` body of cards — so the page
 * replaces it in place. These pages have no rails or sidebar; drawing the chat shell for them
 * promised a layout that never arrives.
 */
export const PageSkeleton = () => {
    const { t } = useTranslation();
    return (
        <div
            data-page-skeleton
            className="flex h-full flex-col bg-background"
            role="status"
            aria-label={t('common.loading')}
        >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-5 w-32" />
            </div>
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-hidden p-8">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                ))}
            </div>
        </div>
    );
};
