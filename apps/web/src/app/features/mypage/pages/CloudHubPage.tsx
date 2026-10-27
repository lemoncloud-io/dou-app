import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { IconChevronRight, IconSpinner, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { canRetryCloudSetup, cloudDisplayName, isCloudEnterable, resolveCloudRowState } from '../../../utils';
import { CloudIdentity } from '../components/CloudIdentity';
import { useOwnedCloud } from '../hooks/useOwnedCloud';
import { useRetryCloudSetup } from '../hooks/useRetryCloudSetup';

/**
 * One cloud's menu (Figma 4915-17766): its profile (edit), its information (read, and release),
 * and the places it holds.
 *
 * The profile and places rows are for a cloud that is ready to be entered — a deployed, un-held one.
 * The places row needs that cloud's own session; the profile row follows the same rule so a cloud
 * that is not ready yet is not edited either. A provisioning, failed or held cloud leaves both
 * disabled with the reason as the subtitle, and keeps the information row, which is where its state
 * is explained and where it is released.
 * A cloud whose setup failed before it got a workspace slot also gets a retry row: the relay sets it
 * up again, the catalog is re-read, and the cloud reads as provisioning everywhere. One that failed
 * after its slot was assigned gets none, since the relay refuses it (`canRetryCloudSetup`); a refusal
 * that still comes back is the failure toast, and releasing is what is left.
 * Not an owned cloud (or not mine): back to the list once the catalog has said so.
 */
export const CloudHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { toast } = useToast();
    const { cloud, isResolved } = useOwnedCloud(cloudId);
    const retrySetup = useRetryCloudSetup();

    useEffect(() => {
        if (isResolved && !cloud) navigate(ROUTES.mypage.cloud.manage, { replace: true });
    }, [isResolved, cloud, navigate]);

    const chevron = <IconChevronRight className="size-5 text-placeholder" />;
    const rowState = cloud ? resolveCloudRowState(cloud) : undefined;
    const canEnter = !!rowState && isCloudEnterable(rowState);
    const go = (to: string) => () => navigate(to);

    const retry = async () => {
        if (!cloud?.id) return;
        try {
            await retrySetup.mutateAsync({ id: cloud.id });
            toast({ title: t('mypage.cloudManage.hub.retrySuccess') });
        } catch (error) {
            logger.error('CLOUD', 'cloud setup retry failed', { error, data: { cloudId: cloud.id } });
            toast({ title: t('mypage.cloudManage.hub.retryFailed'), variant: 'destructive' });
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.cloudManage.title')} />
            </div>
            {!cloud || !cloudId ? (
                <div className="flex justify-center pt-20">
                    <IconSpinner className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="flex flex-col gap-8 pb-8 pt-6">
                    <CloudIdentity name={cloudDisplayName(cloud)} />
                    <div className="px-4">
                        <MenuCard>
                            <ListRow
                                title={t('mypage.cloudManage.hub.profile')}
                                subtitle={canEnter ? undefined : t('mypage.cloudManage.hub.notEnterable')}
                                trailing={chevron}
                                disabled={!canEnter}
                                onClick={go(ROUTES.mypage.cloud.edit(cloudId))}
                            />
                            <ListRow
                                title={t('mypage.cloudManage.hub.detail')}
                                trailing={chevron}
                                onClick={go(ROUTES.mypage.cloud.detail(cloudId))}
                            />
                            <ListRow
                                title={t('mypage.cloudManage.hub.places')}
                                subtitle={canEnter ? undefined : t('mypage.cloudManage.hub.notEnterable')}
                                trailing={chevron}
                                disabled={!canEnter}
                                onClick={go(ROUTES.mypage.cloud.places(cloudId))}
                            />
                        </MenuCard>
                    </div>
                    {canRetryCloudSetup(cloud) && (
                        <div className="px-4">
                            <MenuCard>
                                <ListRow
                                    title={t('mypage.cloudManage.hub.retry')}
                                    disabled={retrySetup.isPending}
                                    onClick={() => void retry()}
                                />
                            </MenuCard>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
