import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import {
    FloatingButton,
    IconBack,
    IconButton,
    ModalTopBar,
    ScreenLayout,
    myCloudIllustration,
} from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useAllowedProduct } from '../hooks';
import cloudGuidePreview from '../../../../assets/cloud-guide-preview.png';
import { GuideBulletList, PlanCompareCard, type GuideBullet } from './cloud-guide';

/**
 * "내 클라우드" guide (`/subscription/guide`, Figma 3519-29515) — a read-only pitch comparing the
 * free relay experience with a subscribed cloud. Reached from the MyPage subscription card; the home
 * banner and the cloud switcher deliberately bypass it and go straight to the purchase flow
 * (ADR-0034). The only side effect here is the CTA's navigate.
 */
export const CloudGuidePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    // Trial length comes from the store product so the CTA never promises a trial that isn't
    // configured. `product` is undefined off-native (see useAllowedProduct), so the web default is
    // the label that makes no trial claim at all.
    const { product } = useAllowedProduct();
    const trialDays = product?.trialDays ?? 0;
    const ctaLabel =
        trialDays > 0
            ? t('mypage.subscription.cloudGuide.ctaWithTrial', { days: trialDays })
            : t('mypage.subscription.cloudGuide.ctaPlain');

    const freeItems: GuideBullet[] = [
        { title: t('mypage.subscription.cloudGuide.free.limit1') },
        { title: t('mypage.subscription.cloudGuide.free.limit2') },
        { title: t('mypage.subscription.cloudGuide.free.limit3') },
    ];
    const proItems: GuideBullet[] = [
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
                    // FloatingButton renders `link` BELOW the button; Figma puts the caption above
                    // it (3519-30594 sits over 3519-30588), so reverse the panel's column.
                    wrapperClassName="flex-col-reverse pb-[calc(var(--safe-bottom,0px)+1rem)]"
                    link={
                        <p className="text-center text-[14px] leading-[1.4] tracking-[-0.07px] text-description">
                            {t('mypage.subscription.cloudGuide.ctaCaption')}
                        </p>
                    }
                />
            }
        >
            {/* Hero — headline with the cloud illustration to its right. */}
            <section className="flex items-end justify-between gap-4 px-4 pb-6 pt-6">
                {/* whitespace-pre-line: heroRest carries the line breaks from the localized copy. */}
                <h1 className="flex-1 whitespace-pre-line text-[20px] font-bold leading-[1.35] tracking-[-0.1px] text-foreground">
                    <span className="text-primary">{t('mypage.subscription.cloudGuide.heroAccent')}</span>
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
                    <GuideBulletList items={freeItems} />
                </PlanCompareCard>

                {/* Static descending dots between the cards — decoration, not a carousel indicator. */}
                <div aria-hidden className="flex flex-col items-center gap-2 py-4">
                    <span className="size-2 rounded-full bg-input-border" />
                    <span className="size-[11px] rounded-full bg-input-border" />
                    <span className="size-[14px] rounded-full bg-input-border" />
                </div>

                <PlanCompareCard
                    name={t('mypage.subscription.cloudGuide.pro.name')}
                    tier="pro"
                    tierLabel={t('mypage.subscription.cloudGuide.pro.badge')}
                    headline={t('mypage.subscription.cloudGuide.pro.headline')}
                >
                    <GuideBulletList items={proItems} tone="emphasis" />
                    {/* App preview, cropped to its top inside a device-like frame. */}
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
