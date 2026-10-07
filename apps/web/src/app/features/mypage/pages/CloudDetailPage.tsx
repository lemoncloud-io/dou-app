import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { runtime } from '@chatic/app-runtime';
import { AlertDialog, Divider, IconSpinner, InfoField, ListRow } from '@chatic/web-ui-kit';

import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';

import { ROUTES } from '../../../routes/paths';
import { cloudDisplayName } from '../../../utils';
import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { PageHeader } from '../../../ui/components';
import { CloudIdentity } from '../components/CloudIdentity';
import { useDeleteCloud } from '../hooks/useDeleteCloud';
import { useOwnedCloud } from '../hooks/useOwnedCloud';
import { type CloudStatusTone, cloudStatusWord } from '../lib';

const TONE_CLASS: Record<CloudStatusTone, string> = {
    info: 'text-point-blue',
    warning: 'text-[hsl(var(--warning,38_92%_50%))]',
    danger: 'text-destructive',
};

/**
 * "클라우드 정보" — one cloud, read-only, and the one place it is released (Figma 4992-48744).
 *
 * The rows are the catalog's facts: name, when it was made, the recovery address bound to it, and
 * its standing in words (`cloudStatusWord`). A fact the relay did not send is not drawn — the
 * created date, say — except the linked account, which the design draws as a dash because its
 * absence is itself the fact (there is nothing to recover the cloud with).
 *
 * Releasing is irreversible and cascades, so it is confirmed, and a release of the ACTIVE cloud
 * ends the cloud session and reloads: the session's tokens name a cloud that no longer exists.
 */
export const CloudDetailPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { cloud, isResolved } = useOwnedCloud(cloudId);
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { logoutCloudSession } = useLogoutCloudSession();
    const deleteCloud = useDeleteCloud();

    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    // The catalog patch below empties `cloud` before the release finishes; without this the
    // not-mine redirect would fire mid-release, ahead of the logout and the toast.
    const isReleasing = useRef(false);

    useEffect(() => {
        if (isResolved && !cloud && !isReleasing.current) navigate(ROUTES.mypage.cloud.manage, { replace: true });
    }, [isResolved, cloud, navigate]);

    const release = async () => {
        if (!cloud?.id) return;
        const id = cloud.id;
        const wasActive = id === selectedCloudId;
        setIsConfirmOpen(false);
        isReleasing.current = true;
        try {
            await deleteCloud.mutateAsync({ id, cascade: true });
            queryClient.setQueriesData<ListResult<CloudView>>({ queryKey: runtime.data.cloudsKeys.lists() }, old => {
                if (!old?.list) return old;
                return { ...old, list: old.list.filter(c => c.id !== id) };
            });
            logger.info('CLOUD', 'cloud released', { cloudId: id, wasActive });
            toast({ title: t('mypage.cloudManage.deleteSuccess') });
            if (wasActive) {
                await logoutCloudSession();
                window.location.href = ROUTES.auth.login;
                return;
            }
            navigate(ROUTES.mypage.cloud.manage, { replace: true });
        } catch (error) {
            // Releasing a cloud is irreversible and cascades; a failure has to leave a trace.
            logger.error('CLOUD', 'cloud release failed', { error, data: { cloudId: id } });
            toast({ title: t('mypage.cloudManage.deleteFailed'), variant: 'destructive' });
            isReleasing.current = false;
        }
    };

    const name = cloud ? cloudDisplayName(cloud) : '';
    const word = cloud ? cloudStatusWord(cloud) : undefined;
    // Zero-padded and locale-aware, the same format the place information screen uses.
    const createdAt = cloud?.createdAt
        ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
              cloud.createdAt
          )
        : null;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.cloudManage.detail.title')} />
            </div>
            {!cloud || !word ? (
                <div className="flex justify-center pt-20">
                    <IconSpinner className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="flex flex-col gap-8 pb-8 pt-6">
                    <CloudIdentity name={name} />

                    <div className="flex flex-col gap-6">
                        <InfoField label={t('mypage.cloudManage.detail.nameLabel')}>{name}</InfoField>
                        {createdAt && (
                            <InfoField label={t('mypage.cloudManage.detail.createdAtLabel')}>{createdAt}</InfoField>
                        )}
                        <InfoField label={t('mypage.cloudManage.detail.accountLabel')}>{cloud.email ?? '-'}</InfoField>
                        <InfoField label={t('mypage.cloudManage.detail.statusLabel')}>
                            <span className={TONE_CLASS[word.tone]}>{t(`mypage.cloudManage.status.${word.key}`)}</span>
                        </InfoField>
                    </div>

                    <Divider variant="block" />

                    <ListRow
                        title={t('mypage.cloudManage.delete')}
                        destructive
                        disabled={deleteCloud.isPending}
                        onClick={() => setIsConfirmOpen(true)}
                    />
                </div>
            )}

            <AlertDialog
                open={isConfirmOpen}
                onOpenChange={setIsConfirmOpen}
                title={t('mypage.cloudManage.deleteConfirmTitle')}
                description={
                    <span className="whitespace-pre-line">
                        {t('mypage.cloudManage.deleteConfirmDesc', { name })}
                        {cloud?.id === selectedCloudId && `\n${t('mypage.cloudManage.deleteSelectedCloudWarning')}`}
                    </span>
                }
                cancelLabel={t('common.cancel')}
                confirmLabel={t('mypage.cloudManage.delete')}
                destructive
                onConfirm={() => void release()}
            />
        </div>
    );
};
