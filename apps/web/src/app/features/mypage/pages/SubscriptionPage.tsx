import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

export const SubscriptionPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();

    // TODO: Replace with actual subscription data from API
    const subscription = null as {
        count: number;
        period: { start: string; end: string };
        currentPayment: string;
        nextPayment: string;
        pendingChange?: string;
    } | null;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.subscription.title')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {subscription ? (
                    <>
                        {/* Current Subscription Section */}
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                                {t('mypage.subscription.currentPlan')}
                            </span>

                            <div className="rounded-[20px] border-2 border-[#B0EA10] bg-card p-1.5 shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)]">
                                {/* Plan Info */}
                                <div className="flex items-center justify-between px-4 py-3">
                                    <span className="text-[18px] font-semibold tracking-[-0.015em]">
                                        {t('mypage.subscription.planActive', { count: subscription.count })}
                                    </span>
                                    <button
                                        onClick={() => navigate('/mypage/subscription/plans')}
                                        className="flex items-center gap-1"
                                    >
                                        <span className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
                                            {t('mypage.subscription.changePlan')}
                                        </span>
                                        <ChevronRight size={18} />
                                    </button>
                                </div>

                                {/* Divider */}
                                <div className="mx-auto w-[calc(100%-24px)] border-t border-border" />

                                {/* Details */}
                                <div className="flex flex-col gap-[6px] px-3.5 py-3">
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[90px] text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.period')}
                                        </span>
                                        <span className="text-[16px] font-medium">
                                            {subscription.period.start} ~ {subscription.period.end}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[90px] text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.currentPayment')}
                                        </span>
                                        <span className="text-[16px] font-medium">{subscription.currentPayment}</span>
                                    </div>
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[90px] text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.nextPayment')}
                                        </span>
                                        <span className="text-[16px] font-medium">{subscription.nextPayment}</span>
                                    </div>

                                    {subscription.pendingChange && (
                                        <div className="mt-2 rounded-[10px] bg-[rgba(0,43,126,0.04)] px-3 py-2 text-center">
                                            <span className="text-[16px] font-medium tracking-[-0.02em] text-[#84888F]">
                                                {subscription.pendingChange}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Detail Link */}
                                <div className="flex justify-center py-1">
                                    <span className="text-[16px] font-medium tracking-[-0.02em] text-foreground underline">
                                        {t('mypage.subscription.viewDetail')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Empty State */
                    <div className="flex flex-col items-center gap-6 pt-20">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[18px] font-semibold">{t('mypage.subscription.empty')}</span>
                            <span className="text-[15px] text-muted-foreground">
                                {t('mypage.subscription.emptyDescription')}
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/mypage/subscription/plans')}
                            className="rounded-full bg-foreground px-8 py-3 text-[16px] font-semibold text-background"
                        >
                            {t('mypage.subscription.viewPlans')}
                        </button>
                    </div>
                )}

                {/* Notice Section */}
                <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center gap-2 px-1">
                        <AlertCircle size={20} className="flex-shrink-0 text-foreground" />
                        <span className="text-[16px] font-semibold">{t('mypage.subscription.notice')}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-1">
                        {(['notice1', 'notice2', 'notice3'] as const).map(key => (
                            <div key={key} className="flex items-start gap-2 px-4 py-1.5">
                                <span className="text-[14px] text-muted-foreground">•</span>
                                <span className="text-[14px] leading-[1.4] tracking-[-0.015em] text-muted-foreground">
                                    {t(`mypage.subscription.${key}`)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
