import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useSubscriptionIap } from '../hooks';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

interface NativePurchase {
    productId: string;
    transactionDate: number;
    transactionId?: string | null;
    isAutoRenewing: boolean;
    platform: string;
    expirationDateIOS?: number | null;
}

const formatDate = (timestamp?: number | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString();
};

export const SubscriptionPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { isOnMobileApp } = getMobileAppInfo();
    const { restorePurchases } = useSubscriptionIap();
    const [isRestoring, setIsRestoring] = useState(false);

    const [purchases, setPurchases] = useState<NativePurchase[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isOnMobileApp) {
            setIsLoading(false);
            return;
        }
        postMessage({ type: 'FetchCurrentPurchases' });
    }, [isOnMobileApp]);

    useHandleAppMessage('OnFetchCurrentPurchases', message => {
        const now = Date.now();
        const validPurchases = (message.data.purchases as NativePurchase[]).filter(p => {
            const expiry = p.expirationDateIOS;
            return !expiry || expiry > now;
        });
        setPurchases(validPurchases);
        console.log('Received purchases:', message.data.purchases, 'valid:', validPurchases.length);
        setIsLoading(false);
    });

    const activePurchase = purchases[0] ?? null;
    const isCanceled = activePurchase ? !activePurchase.isAutoRenewing : false;

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const count = await restorePurchases();
            toast({
                title:
                    count > 0
                        ? t('mypage.subscription.restoreSuccess', { count })
                        : t('mypage.subscription.restoreEmpty'),
            });
            if (count > 0) postMessage({ type: 'FetchCurrentPurchases' });
        } catch (e) {
            console.error('[SubscriptionPage] restore failed:', e);
            toast({ title: t('mypage.subscription.restoreFailed'), variant: 'destructive' });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background overflow-y-auto">
            {/* Header */}
            <header className="flex items-center px-[6px] pt-safe-top">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <h1 className="flex-1 text-center text-[16px] font-semibold">{t('mypage.subscription.title')}</h1>
                <div className="w-[44px]" />
            </header>

            <div className="flex flex-col gap-[18px] px-4 pt-4 pb-safe-bottom">
                {isLoading ? (
                    <div className="flex items-center justify-center pt-20">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </div>
                ) : activePurchase ? (
                    <>
                        {/* Current Subscription */}
                        <div className="flex flex-col gap-1">
                            <span className="px-1 text-[16px] font-medium tracking-[-0.015em] text-label">
                                {t('mypage.subscription.currentPlan')}
                            </span>

                            <div
                                className={`rounded-[20px] border-2 bg-card p-1.5 shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] ${isCanceled ? 'border-yellow-400' : 'border-[#B0EA10]'}`}
                            >
                                {/* Plan Info */}
                                <div className="flex items-center justify-between gap-2 px-4 py-3">
                                    <span className="min-w-0 truncate text-[18px] font-semibold tracking-[-0.015em]">
                                        {activePurchase.productId}
                                    </span>
                                    <button
                                        onClick={() => navigate('/mypage/subscription/plans')}
                                        className="flex shrink-0 items-center gap-1"
                                    >
                                        <span className="text-[15px] font-medium tracking-[-0.015em] text-foreground">
                                            {t('mypage.subscription.changePlan')}
                                        </span>
                                        <ChevronRight size={18} />
                                    </button>
                                </div>

                                {/* Divider */}
                                <div className="mx-auto w-[calc(100%-24px)] border-t border-border" />

                                {/* Status Badge */}
                                {isCanceled && (
                                    <div className="mx-3 mt-1 rounded-[10px] bg-yellow-50 px-3 py-2 text-center dark:bg-yellow-950/30">
                                        <span className="text-[14px] font-medium text-yellow-600 dark:text-yellow-400">
                                            {t('mypage.subscription.canceledNotice', {
                                                date: formatDate(activePurchase?.expirationDateIOS),
                                            })}
                                        </span>
                                    </div>
                                )}

                                {/* Details */}
                                <div className="flex flex-col gap-[6px] px-3.5 py-3">
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.platform')}
                                        </span>
                                        <span className="text-[16px] font-medium capitalize">
                                            {activePurchase.platform}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.purchaseDate')}
                                        </span>
                                        <span className="text-[16px] font-medium">
                                            {formatDate(activePurchase.transactionDate)}
                                        </span>
                                    </div>
                                    {activePurchase.expirationDateIOS && (
                                        <div className="flex items-center gap-[18px]">
                                            <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                                {t('mypage.subscription.expiresAt')}
                                            </span>
                                            <span className="text-[16px] font-medium">
                                                {formatDate(activePurchase.expirationDateIOS)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-[18px]">
                                        <span className="w-[100px] shrink-0 text-[16px] text-muted-foreground">
                                            {t('mypage.subscription.status')}
                                        </span>
                                        <span
                                            className={`text-[16px] font-medium ${isCanceled ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                                        >
                                            {isCanceled
                                                ? t('mypage.subscription.statusCanceled')
                                                : t('mypage.subscription.statusActive')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Manage / Restore */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => postMessage({ type: 'OpenSubscriptionManagement' })}
                                className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground"
                            >
                                {t('mypage.subscription.manageSubscription')}
                            </button>
                            <button
                                onClick={handleRestore}
                                disabled={isRestoring}
                                className="flex-1 rounded-[14px] border border-border bg-card px-4 py-3.5 text-center text-[15px] font-medium text-muted-foreground disabled:opacity-50"
                            >
                                {isRestoring ? (
                                    <Loader2 size={16} className="mx-auto animate-spin" />
                                ) : (
                                    t('mypage.subscription.restore')
                                )}
                            </button>
                        </div>

                        {/* Other purchases */}
                        {purchases.length > 1 && (
                            <div className="flex flex-col gap-2">
                                <span className="px-1 text-[14px] font-medium text-muted-foreground">
                                    {t('mypage.subscription.otherReceipts', { count: purchases.length - 1 })}
                                </span>
                                {purchases.slice(1).map((purchase, i) => (
                                    <div
                                        key={purchase.transactionId ?? i}
                                        className="rounded-[14px] border border-border bg-card px-4 py-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[15px] font-medium">{purchase.productId}</span>
                                            <span className="text-[13px] text-muted-foreground">
                                                {formatDate(purchase.transactionDate)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    /* Empty State */
                    <div className="flex flex-col items-center gap-6 pt-20">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[18px] font-semibold">{t('mypage.subscription.empty')}</span>
                            <span className="text-[15px] text-muted-foreground">
                                {!isOnMobileApp
                                    ? t('mypage.subscription.mobileOnly')
                                    : t('mypage.subscription.emptyDescription')}
                            </span>
                        </div>
                        {isOnMobileApp && (
                            <button
                                onClick={() => navigate('/mypage/subscription/plans')}
                                className="rounded-full bg-foreground px-8 py-3 text-[16px] font-semibold text-background"
                            >
                                {t('mypage.subscription.viewPlans')}
                            </button>
                        )}
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
                        <div className="flex items-start gap-2 px-4 py-1.5">
                            <span className="text-[14px] text-muted-foreground">•</span>
                            <span className="text-[14px] leading-[1.4] tracking-[-0.015em] text-muted-foreground">
                                <Trans
                                    i18nKey="mypage.subscription.noticeTerms"
                                    components={{
                                        terms: (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const url = IS_DEV
                                                        ? 'https://app-dev.chatic.io/policy/terms'
                                                        : 'https://app.chatic.io/policy/terms';
                                                    if (isOnMobileApp) {
                                                        postMessage({ type: 'OpenURL', data: { url } });
                                                    } else {
                                                        window.open(url, '_blank');
                                                    }
                                                }}
                                                className="underline text-foreground"
                                            />
                                        ),
                                    }}
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
