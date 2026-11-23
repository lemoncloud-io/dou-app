import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import {
    FloatingButton,
    IconBack,
    IconButton,
    ModalTopBar,
    PlanBulletList,
    PlanCompareCard,
    ScreenLayout,
    myCloudIllustration,
    type PlanBullet,
} from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { usePlanCatalog } from '../hooks';
import cloudGuidePreview from '../../../../assets/cloud-guide-preview.png';

export const CloudGuidePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const { sellablePlans, trialEligible } = usePlanCatalog();
    const trialDays = trialEligible ? (sellablePlans[0]?.trialDays ?? 0) : 0;
    const ctaLabel =
        trialDays > 0
            ? t('mypage.subscription.cloudGuide.ctaWithTrial', { days: trialDays })
            : t('mypage.subscription.cloudGuide.ctaPlain');

    const freeItems: PlanBullet[] = [
        { title: t('mypage.subscription.cloudGuide.free.limit1') },
        { title: t('mypage.subscription.cloudGuide.free.limit2') },
        { title: t('mypage.subscription.cloudGuide.free.limit3') },
    ];
    const proItems: PlanBullet[] = [
        {
            title: t('mypage.subscription.cloudGuide.pro.benefit1Title'),
            description: t('mypage.subscription.cloudGuide.pro.benefit1Description'),
        },
        {
            title: t('mypage.subscription.cloudGuide.pro.benefit2Title'),
            description: t('mypage.subscription.cloudGuide.pro.benefit2Description'),
        },
        {
            title: t('mypage.subscription.cloudGuide.pro.benefit3Title'),
            description: t('mypage.subscription.cloudGuide.pro.benefit3Description'),
        },
    ];

    return (
        <ScreenLayout
            header={
                <ModalTopBar
                    safeArea
                    leftSlot={
                        <IconButton
                            icon={<IconBack className="size-[26px]" />}
                            label={t('common.back')}
                            onClick={() => navigate(-1)}
                        />
                    }
                />
            }
            footer={
                <FloatingButton
                    label={ctaLabel}
                    onClick={() => navigate(ROUTES.subscription.plans)}
                    wrapperClassName="flex-col-reverse rounded-none shadow-none"
                    link={
                        <p className="text-center text-[15px] font-medium leading-[normal] tracking-[-0.075px] text-foreground">
                            {t('mypage.subscription.cloudGuide.ctaCaption')}
                        </p>
                    }
                />
            }
        >
            <section className="flex items-end justify-between gap-4 px-4 pb-6 pt-6">
                <h1 className="flex-1 whitespace-pre-line text-[20px] font-bold leading-[1.35] tracking-[-0.1px] text-foreground">
                    <span className="text-main-accent">{t('mypage.subscription.cloudGuide.heroAccent')}</span>
                    {t('mypage.subscription.cloudGuide.heroRest')}
                </h1>
                <img src={myCloudIllustration} alt="" className="size-[102px] shrink-0" />
            </section>

            <div className="flex flex-col items-center px-4 pb-2">
                <PlanCompareCard
                    name={t('mypage.subscription.cloudGuide.free.name')}
                    tier="free"
                    tierLabel={t('mypage.subscription.cloudGuide.free.badge')}
                    headline={t('mypage.subscription.cloudGuide.free.headline')}
                >
                    <PlanBulletList items={freeItems} />
                </PlanCompareCard>

                <div aria-hidden className="flex flex-col items-center gap-2 py-4">
                    <span className="size-2 rounded-full bg-input-border" />
                    <span className="size-[11px] rounded-full bg-input-border" />
                    <span className="size-[14px] rounded-full bg-input-border" />
                </div>

                <PlanCompareCard
                    name={t('mypage.subscription.cloudGuide.pro.name')}
                    tier="paid"
                    tierLabel={t('mypage.subscription.cloudGuide.pro.badge')}
                    headline={t('mypage.subscription.cloudGuide.pro.headline')}
                >
                    <PlanBulletList items={proItems} tone="emphasis" />
                    <div className="flex justify-center pt-4">
                        <div className="h-[229px] w-[196px] overflow-hidden rounded-t-3xl border-x-[6px] border-t-[6px] border-secondary">
                            <img
                                src={cloudGuidePreview}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover object-top"
                            />
                        </div>
                    </div>
                </PlanCompareCard>
            </div>
        </ScreenLayout>
    );
};
