import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { Button, Divider, IconPlus, IconSpinner, PromoBanner } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { PageHeader } from '../../../ui/components';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { CloudManageBanner, CurrentPlanCard, useCloudManageScene, useCloudQuota } from '../../subscription';
import { CloudManageRow } from '../components/CloudManageRow';
import { SectionLabel } from '../components/SectionLabel';
import { useOwnedClouds } from '../hooks/useOwnedClouds';

export const CloudManagePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const sellsInStore = runtime.checkout.kind === 'store';

    const { clouds, isPendingClouds } = useOwnedClouds();
    const { isLoading: isSceneLoading, hasSubscription, banner } = useCloudManageScene();
    const { used, limit } = useCloudQuota();
    const requestAddCloud = useAddCloudRequest(s => s.requestAddCloud);

    const isLoading = isSceneLoading || isPendingClouds;
    const figure = limit != null ? `${used} / ${limit}` : undefined;

    const body = isLoading ? (
        <div className="flex justify-center pt-20">
            <IconSpinner className="size-6 animate-spin text-muted-foreground" />
        </div>
    ) : !hasSubscription ? (
        <div className="flex flex-col gap-6 px-4 pt-2">
            <SectionLabel title={t('mypage.cloudManage.sectionMine')} />
            <div className="flex flex-col items-center gap-3 rounded-[18px] bg-card px-4 py-8 shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <span
                    aria-hidden
                    className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-[18px] font-bold text-main-accent"
                >
                    !
                </span>
                <span className="text-center text-[17px] font-semibold text-foreground">
                    {t('mypage.cloudManage.emptyTitle')}
                </span>
                <span className="text-center text-[14px] text-description">
                    {sellsInStore ? t('mypage.cloudManage.emptyDescription') : t('mypage.subscription.mobileOnly')}
                </span>
            </div>
            {sellsInStore && (
                <Button size="lg" fullWidth onClick={() => navigate(ROUTES.subscription.guide)}>
                    {t('mypage.subscription.subscribe')}
                </Button>
            )}
        </div>
    ) : (
        <>
            <div className="flex flex-col gap-4 pt-2">
                <SectionLabel title={t('mypage.cloudManage.sectionMine')} figure={figure} />
                <div className="px-4">
                    <CloudManageBanner />
                </div>
                {clouds.length === 0 ? (
                    <div className="px-4">
                        <PromoBanner
                            icon={
                                <span aria-hidden className="text-[40px] leading-none">
                                    ☁️
                                </span>
                            }
                            title={t('mypage.cloudManage.emptyTip')}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 px-3">
                        {clouds.map(cloud => (
                            <CloudManageRow
                                key={cloud.id}
                                cloud={cloud}
                                onOpen={cloudId => navigate(ROUTES.mypage.cloud.hub(cloudId))}
                            />
                        ))}
                    </div>
                )}
                {!banner && (
                    <div className="px-4 py-2">
                        <button
                            type="button"
                            onClick={requestAddCloud}
                            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-full border border-input-border px-[25px] text-[16px] font-semibold tracking-[-0.08px] text-foreground active:bg-muted/50"
                        >
                            <IconPlus className="size-6" />
                            {t('mypage.cloudManage.addCloud')}
                            {figure && <span className="text-[16px] font-semibold text-foreground">{figure}</span>}
                        </button>
                    </div>
                )}
            </div>

            <Divider variant="block" className="my-4" />

            <div className="flex flex-col gap-2 pb-8">
                <SectionLabel title={t('mypage.subscription.currentPlan')} />
                <div className="px-4 py-2">
                    <CurrentPlanCard />
                </div>
            </div>
        </>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.cloudManage.title')} />
            </div>
            {body}
            <SafeAreaBottomSpacer />
        </div>
    );
};
