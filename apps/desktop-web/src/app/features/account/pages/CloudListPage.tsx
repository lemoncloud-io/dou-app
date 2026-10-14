import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { PageShell, useCloudSessionCatalog } from '../../../shared';

/**
 * Owned-cloud list (the relay catalog lists owned clouds only, so presence
 * here IS ownership). Buying happens in the mobile app — this page lists and
 * opens, never sells.
 */
export const CloudListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { clouds, isCloudsError, isFetchingClouds, isPendingClouds, refetchClouds } = useCloudSessionCatalog();

    return (
        <PageShell
            title={t('cloud.list.title')}
            backTo="/account"
            backLabel={t('account.title')}
            contentClassName="flex flex-col"
        >
            {isPendingClouds || (isFetchingClouds && clouds.length === 0) ? (
                <div
                    role="status"
                    aria-label={t('chat.loading')}
                    className="flex flex-1 items-center justify-center py-8"
                >
                    <span className="block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                </div>
            ) : isCloudsError ? (
                <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-callout text-foreground">{t('cloud.list.failed')}</p>
                    <Button variant="outline" size="sm" onClick={() => void refetchClouds()}>
                        {t('chat.retry')}
                    </Button>
                </div>
            ) : clouds.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-heading text-foreground">{t('cloud.list.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('cloud.list.emptyHint')}</p>
                </div>
            ) : (
                <ul className="flex flex-col gap-1">
                    {clouds.map(cloud => (
                        <li key={cloud.id}>
                            <button
                                type="button"
                                onClick={() => cloud.id && navigate(`/account/clouds/${cloud.id}`)}
                                className="focus-ring tactile flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                            >
                                <span className="min-w-0 flex-1 truncate text-callout font-medium text-foreground">
                                    {cloud.name ?? cloud.id}
                                </span>
                                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </PageShell>
    );
};
