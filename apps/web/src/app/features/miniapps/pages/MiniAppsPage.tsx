import { useTranslation } from 'react-i18next';

import { SlidersHorizontal } from 'lucide-react';

import type { DomainMiniApp } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { cn } from '@chatic/ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { Button, IconChevronRight, IconNavMiniAppSolid } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { BottomNavSpacer } from '../../../ui/components/BottomNavSpacer';
import { MiniAppConsentDialog } from '../components/MiniAppConsentDialog';
import { MiniAppStatusChip, MiniAppTile, hostOf } from '../components/MiniAppParts';
import { MiniAppSheet } from '../components/MiniAppSheet';
import { useCloudMiniApps } from '../hooks/useCloudMiniApps';
import { useMiniAppEditor } from '../hooks/useMiniAppEditor';
import { useMiniAppOpener, type MiniAppOpenOutcome } from '../hooks/useMiniAppOpener';

export const MiniAppsPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const miniApps = useCloudMiniApps();
    const { cloudId, cloudName, isOwner, visible, active } = miniApps;
    const editor = useMiniAppEditor(miniApps);
    const opener = useMiniAppOpener({
        cloudId,
        cloudName,
        isOwner,
        active,
        onOpened: (outcome: MiniAppOpenOutcome) => {
            if (outcome === 'failed') toast({ title: t('miniApps.openFailed'), variant: 'destructive' });
            if (outcome === 'outside') toast({ title: t('miniApps.openedOutside') });
        },
        onAddRequested: () => navigate(ROUTES.miniApps.manage, { state: { add: true } }),
    });

    const press = (app: DomainMiniApp) => {
        if (app.status === 'active') opener.open(app);
        else if (isOwner) editor.edit(app);
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <header className="flex min-h-[calc(var(--safe-top,0px)+4rem)] shrink-0 items-center justify-between px-4 pb-2 pt-[calc(var(--safe-top,0px)+0.5rem)]">
                <h1 className="text-[28px] font-bold leading-[25px] tracking-[-0.5px] text-brand-ink dark:text-foreground">
                    {t('miniApps.title')}
                </h1>
                {isOwner && (
                    <button
                        type="button"
                        aria-label={t('miniApps.manage')}
                        onClick={() => navigate(ROUTES.miniApps.manage)}
                        className="flex size-10 items-center justify-center rounded-full border border-border text-foreground"
                    >
                        <SlidersHorizontal className="size-5" aria-hidden="true" />
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {cloudId === null ? (
                    <EmptyState owner={false} />
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={opener.openHub}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted/50"
                        >
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-brand-ink text-white">
                                <IconNavMiniAppSolid size={22} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                                <span className="text-[16px] text-foreground">{t('miniApps.hub.title')}</span>
                                <span className="truncate text-[13px] text-description">
                                    {t('miniApps.hub.subtitle')}
                                </span>
                            </span>
                            <IconChevronRight className="size-[18px] text-description" />
                        </button>

                        <div aria-hidden="true" className="my-2 h-2 bg-muted" />

                        <div className="flex h-12 items-center gap-1.5 px-4">
                            <h2 className="truncate text-[18px] font-bold text-foreground">{cloudName}</h2>
                            {!miniApps.isLoading && !miniApps.isError && (
                                <span className="text-[18px] font-bold text-description">{visible.length}</span>
                            )}
                        </div>

                        {miniApps.isLoading ? (
                            <LoadingRows />
                        ) : miniApps.isError ? (
                            <LoadFailed onRetry={miniApps.retry} />
                        ) : visible.length === 0 ? (
                            <EmptyState owner={isOwner} onAdd={() => editor.edit('new')} />
                        ) : (
                            <>
                                <ul>
                                    {visible.map(app => (
                                        <li key={app.id}>
                                            <MiniAppRow app={app} onPress={() => press(app)} />
                                        </li>
                                    ))}
                                </ul>
                                {isOwner && (
                                    <p className="mx-4 mt-2 text-[13px] leading-[1.5] text-description">
                                        {t('miniApps.ownerNote')}
                                    </p>
                                )}
                            </>
                        )}
                    </>
                )}
                <BottomNavSpacer />
            </div>

            <MiniAppSheet
                editing={editor.editing}
                onClose={editor.close}
                onSubmit={editor.submit}
                onRemove={editor.remove}
            />
            <MiniAppConsentDialog pending={opener.pendingConsent} onAnswer={opener.answerConsent} />
        </div>
    );
};

const MiniAppRow = ({ app, onPress }: { app: DomainMiniApp; onPress: () => void }) => (
    <button
        type="button"
        onClick={onPress}
        data-mini-app-id={app.id}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted/50"
    >
        <MiniAppTile app={app} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="flex min-w-0 items-center gap-1.5">
                <MiniAppStatusChip status={app.status} />
                <span
                    className={cn(
                        'truncate text-[16px]',
                        app.status === 'active' ? 'text-foreground' : 'text-description'
                    )}
                >
                    {app.name}
                </span>
            </span>
            <span className="truncate text-[13px] text-description">{hostOf(app.url)}</span>
        </span>
    </button>
);

const LoadingRows = () => {
    const { t } = useTranslation();
    return (
        <ul aria-busy="true" aria-label={t('miniApps.state.loading')}>
            {[96, 72].map(width => (
                <li key={width} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="size-11 animate-pulse rounded-[12px] bg-muted" />
                    <span className="flex flex-col gap-2">
                        <span className="h-3 animate-pulse rounded-full bg-muted" style={{ width }} />
                        <span className="h-2.5 animate-pulse rounded-full bg-muted" style={{ width: width + 44 }} />
                    </span>
                </li>
            ))}
        </ul>
    );
};

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col items-center gap-2.5 px-4 py-3 text-center">
            <span className="text-[15px] text-description">{t('miniApps.state.loadFailed')}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                {t('miniApps.state.retry')}
            </Button>
        </div>
    );
};

const EmptyState = ({ owner, onAdd }: { owner: boolean; onAdd?: () => void }) => {
    const { t } = useTranslation();
    const kind = owner ? 'emptyOwner' : 'emptyMember';
    return (
        <div className="flex flex-col items-center gap-1.5 px-4 pb-6 pt-5 text-center">
            <span className="text-[16px] text-foreground">{t(`miniApps.state.${kind}.title`)}</span>
            <span className="text-[14px] text-description">{t(`miniApps.state.${kind}.hint`)}</span>
            {owner && onAdd && (
                <Button type="button" size="sm" className="mt-2.5" onClick={onAdd}>
                    {t('miniApps.add')}
                </Button>
            )}
        </div>
    );
};
