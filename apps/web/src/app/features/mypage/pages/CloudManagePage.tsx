import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { Button, Divider, IconPlus, IconSpinner, PromoBanner } from '@chatic/web-ui-kit';

import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { PageHeader } from '../../../ui/components';
import { CloudManageBanner, CurrentPlanCard, useCloudManageScene, useCloudQuota } from '../../subscription';
import { CloudManageRow } from '../components/CloudManageRow';
import { SectionLabel } from '../components/SectionLabel';

/**
 * "클라우드 관리" — the owned clouds under the subscription that allows them (Figma 4472-75743
 * without a subscription · 4998-50957 · 4998-50603 · 4998-52524 · 4998-52720 · 4999-53562 the list
 * · 5000-54966 · 5002-56919 with a banner).
 *
 * The list is the relay catalog; everything the subscription has to say about it — the banner, the
 * allowance figure, the plan card — comes composed from `features/subscription`, which is the only
 * feature that derives the membership. A row opens the cloud's own hub; releasing a cloud moved
 * there, so this screen holds no destructive action.
 *
 * The add button is away while a banner is up: a block, a lapse or a queued downgrade is the state
 * in which the server would refuse the cloud, and the banner is what explains it. Otherwise the
 * button stays whatever the allowance says — the add-cloud flow tells, it does not hide.
 */
export const CloudManagePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const isOnMobileApp = isNative();

    const { clouds, isPendingClouds } = useCloudSessionCatalog();
    const { isLoading: isSceneLoading, hasSubscription, banner } = useCloudManageScene();
    const { used, limit } = useCloudQuota();
    const requestAddCloud = useAddCloudRequest(s => s.requestAddCloud);

    const isLoading = isSceneLoading || isPendingClouds;
    // A figure needs both sides. An unresolved allowance is not zero (see `useCloudQuota`).
    const figure = limit != null ? `${used} / ${limit}` : undefined;

    const body = isLoading ? (
        <div className="flex justify-center pt-20">
            <IconSpinner className="size-6 animate-spin text-muted-foreground" />
        </div>
    ) : !hasSubscription ? (
        // Same card the subscription list shows for an account that never subscribed, with the
        // same call to action: the guide, which is where a first subscription starts.
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
                    {t('mypage.subscription.list.emptyTitle')}
                </span>
                <span className="text-center text-[14px] text-description">
                    {isOnMobileApp
                        ? t('mypage.subscription.list.emptyDescription')
                        : t('mypage.subscription.mobileOnly')}
                </span>
            </div>
            {isOnMobileApp && (
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
            {/* The page is the scrollport, so the bar sticks — see SettingsPage. */}
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.cloudManage.title')} />
            </div>
            {body}
        </div>
    );
};
