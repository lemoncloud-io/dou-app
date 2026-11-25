import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import type { DomainMiniApp } from '@chatic/runtime-react';
import { MINI_APP_LINK_LIMIT } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { IconChevronRight, MenuCard, Switch } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components/PageHeader';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { MiniAppStatusChip, hostOf } from '../components/MiniAppParts';
import { MiniAppSheet } from '../components/MiniAppSheet';
import { useCloudMiniApps } from '../hooks/useCloudMiniApps';
import { useMiniAppEditor } from '../hooks/useMiniAppEditor';

export interface MiniAppManageState {
    add?: boolean;
}

export const MiniAppManagePage = () => {
    const { t } = useTranslation();
    const miniApps = useCloudMiniApps();
    const { cloudId, cloudName, isOwner, ownerKnown, apps } = miniApps;
    const editor = useMiniAppEditor(miniApps);
    const { edit } = editor;
    const location = useLocation();
    const navigate = useNavigate();
    const canAdd = !miniApps.isLoading && !miniApps.isError && apps.length < MINI_APP_LINK_LIMIT;

    const addAsked = useRef((location.state as MiniAppManageState | null)?.add === true);
    useEffect(() => {
        if (!addAsked.current || !isOwner || miniApps.isLoading) return;
        addAsked.current = false;
        navigate(location.pathname, { replace: true, state: null });
        if (canAdd) edit('new');
    }, [isOwner, canAdd, miniApps.isLoading, edit, navigate, location.pathname]);

    if (ownerKnown && !isOwner) return <Navigate to={ROUTES.miniApps.root} replace />;
    if (!isOwner || cloudId === null) return null;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('miniApps.manage')} />
            </div>

            <div className="flex flex-col gap-4 px-4 pb-8 pt-3">
                <MenuCard
                    title={
                        <span className="flex justify-between">
                            <span>{t('miniApps.listTitle', { cloud: cloudName })}</span>
                            <span>{t('miniApps.count', { count: apps.length, max: MINI_APP_LINK_LIMIT })}</span>
                        </span>
                    }
                >
                    {miniApps.isError ? (
                        <p className="px-4 py-3 text-[14px] text-description">{t('miniApps.state.loadFailed')}</p>
                    ) : (
                        apps.map(app => (
                            <ManageRow
                                key={app.id}
                                app={app}
                                onEdit={() => editor.edit(app)}
                                onToggle={(enabled: boolean) => miniApps.updateMiniApp(cloudId, app.id, { enabled })}
                            />
                        ))
                    )}
                </MenuCard>

                {canAdd && (
                    <MenuCard>
                        <button
                            type="button"
                            onClick={() => editor.edit('new')}
                            className="flex min-h-14 w-full items-center gap-2 px-4 text-left active:bg-muted/50"
                        >
                            <span className="flex-1 text-[16px] text-foreground">{t('miniApps.add')}</span>
                            <span className="text-[14px] text-description">
                                {t('miniApps.addHint', { max: MINI_APP_LINK_LIMIT })}
                            </span>
                            <IconChevronRight className="size-[18px] text-description" />
                        </button>
                    </MenuCard>
                )}

                <p className="mx-1.5 text-[13px] leading-[1.5] text-description">{t('miniApps.manageNote')}</p>
            </div>
            <SafeAreaBottomSpacer />

            <MiniAppSheet
                editing={editor.editing}
                onClose={editor.close}
                onSubmit={editor.submit}
                onRemove={editor.remove}
            />
        </div>
    );
};

const ManageRow = ({
    app,
    onEdit,
    onToggle,
}: {
    app: DomainMiniApp;
    onEdit: () => void;
    onToggle: (enabled: boolean) => Promise<unknown>;
}) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [sending, setSending] = useState<boolean | null>(null);
    const held = app.status === 'held';

    const toggle = async (enabled: boolean) => {
        if (held || sending !== null) return;
        setSending(enabled);
        try {
            await onToggle(enabled);
        } catch {
            toast({ title: t('miniApps.toggleFailed'), variant: 'destructive' });
        } finally {
            setSending(null);
        }
    };

    return (
        <div
            className="flex min-h-[60px] items-center gap-2.5 pr-4"
            data-mini-app-id={app.id}
            aria-busy={sending !== null || undefined}
        >
            <button
                type="button"
                onClick={onEdit}
                className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-center gap-0.5 pl-4 text-left"
            >
                <span className="flex min-w-0 items-center gap-1.5">
                    <MiniAppStatusChip status={app.status} />
                    <span className="truncate text-[16px] text-foreground">{app.name}</span>
                </span>
                <span className="truncate text-[13px] text-description">{hostOf(app.url)}</span>
            </button>
            <Switch
                checked={held ? false : (sending ?? app.enabled)}
                onCheckedChange={next => void toggle(next)}
                disabled={held}
                label={t(held ? 'miniApps.switchLabelHeld' : 'miniApps.switchLabel', { name: app.name })}
            />
        </div>
    );
};
