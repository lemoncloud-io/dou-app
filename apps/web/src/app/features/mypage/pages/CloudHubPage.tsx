import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { IconChevronRight, IconSpinner, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { cloudDisplayName, isCloudEnterable, resolveCloudRowState } from '../../../utils';
import { CloudIdentity } from '../components/CloudIdentity';
import { useOwnedCloud } from '../hooks/useOwnedCloud';

/**
 * One cloud's menu (Figma 4915-17766): its profile (edit), its information (read, and release),
 * and the places it holds.
 *
 * The profile and places rows need the cloud's own session, which only a deployed, un-held cloud
 * has — a provisioning, failed or held cloud leaves them disabled with the reason as the subtitle,
 * and keeps the information row, which is where its state is explained and where it is released.
 * Not an owned cloud (or not mine): back to the list once the catalog has said so.
 */
export const CloudHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { cloud, isResolved } = useOwnedCloud(cloudId);

    useEffect(() => {
        if (isResolved && !cloud) navigate(ROUTES.mypage.cloud.manage, { replace: true });
    }, [isResolved, cloud, navigate]);

    const chevron = <IconChevronRight className="size-5 text-placeholder" />;
    const canEnter = !!cloud && isCloudEnterable(resolveCloudRowState(cloud));
    const go = (to: string) => () => navigate(to);

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
                </div>
            )}
        </div>
    );
};
