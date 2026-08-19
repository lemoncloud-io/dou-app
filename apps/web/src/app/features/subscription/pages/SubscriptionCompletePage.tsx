import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { FloatingButton, ScreenLayout } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { usePlanCatalog, usePlanPrice } from '../hooks';

const formatDate = (timestamp?: number): string => {
    if (!timestamp || timestamp <= 0) return '-';
    const d = new Date(timestamp);
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Confirmation after a purchase clears (Figma 2870-32999).
 *
 * The headline date is when the free period ends — which is also when the first charge lands, so it
 * is the one fact worth stating plainly rather than leaving to the store's receipt email. Falls back
 * to the renewal date when the plan carries no trial.
 */
export const SubscriptionCompletePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { summary, currentPlan } = usePlanCatalog();
    const priceOf = usePlanPrice();

    const isTrial = (summary.trialDaysLeft ?? 0) > 0;
    const endsAt = formatDate(summary.validUntil);
    const price = priceOf(currentPlan);

    return (
        <ScreenLayout
            className="h-screen"
            footer={
                <FloatingButton
                    label={t('mypage.subscription.complete.cta')}
                    onClick={() => navigate(ROUTES.home, { replace: true })}
                />
            }
        >
            <div className="flex flex-col gap-8 px-4 pt-20">
                <h1 className="text-center text-[22px] font-bold leading-[1.35] tracking-[-0.02em] text-foreground">
                    {t('mypage.subscription.complete.title')}
                </h1>

                <div className="flex flex-col gap-3 rounded-[16px] bg-[#B0EA10]/10 px-4 py-4">
                    <div className="flex items-center gap-2">
                        <Check size={20} strokeWidth={2.5} className="shrink-0 text-[#6a8a00] dark:text-[#B0EA10]" />
                        <span className="text-[16px] font-semibold leading-[1.4] text-foreground">
                            {isTrial
                                ? t('mypage.subscription.complete.trialEndsOn', { date: endsAt })
                                : t('mypage.subscription.complete.renewsOn', { date: endsAt })}
                        </span>
                    </div>
                    <ul className="flex flex-col gap-1.5 pl-7">
                        {[
                            // Only when the store told us the amount — a charge notice without a
                            // real figure is worse than no notice.
                            price ? t('mypage.subscription.complete.autoChargeAfter', { price }) : null,
                            t('mypage.subscription.complete.cancelAnytime'),
                            t('mypage.subscription.complete.setUpPlace'),
                        ]
                            .filter((text): text is string => !!text)
                            .map(text => (
                                <li key={text} className="flex items-start gap-2">
                                    <span className="text-[14px] leading-[1.5] text-[#78828A]">•</span>
                                    <span className="text-[14px] leading-[1.5] tracking-[-0.015em] text-[#78828A]">
                                        {text}
                                    </span>
                                </li>
                            ))}
                    </ul>
                </div>
            </div>
        </ScreenLayout>
    );
};
