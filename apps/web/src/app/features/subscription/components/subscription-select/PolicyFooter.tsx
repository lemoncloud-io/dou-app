import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { useRestorePurchases } from '../../hooks';

interface PolicyFooterProps {
    onOpenPolicy: (path: string) => void;
}

/**
 * Auto-renewal disclosure plus the links both stores require next to a purchase.
 *
 * "구매 복원" sits here, alongside terms and privacy, for two reasons: it is where a user looks for it
 * (the same row in most apps), and this footer renders on the plan picker — the screen a user is
 * still on when a purchase fails halfway. Reaching restore from the status screen instead would mean
 * navigating away from the failure to find the fix.
 */
export const PolicyFooter = ({ onOpenPolicy }: PolicyFooterProps) => {
    const { t } = useTranslation();
    const { restore, isRestoring, canRestore } = useRestorePurchases();

    return (
        <div className="mt-4 rounded-[12px] bg-muted/50 px-4 py-3">
            <p className="text-[12px] leading-[1.6] text-muted-foreground">
                {t('mypage.subscription.autoRenewNotice')}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => onOpenPolicy('/policy/terms')}
                    className="text-[12px] font-medium text-foreground underline underline-offset-2"
                >
                    {t('mypage.subscription.termsOfService')}
                </button>
                <span className="text-[10px] text-muted-foreground/40">|</span>
                <button
                    type="button"
                    onClick={() => onOpenPolicy('/policy/privacy')}
                    className="text-[12px] font-medium text-foreground underline underline-offset-2"
                >
                    {t('mypage.subscription.privacyPolicy')}
                </button>
                {canRestore && (
                    <>
                        <span className="text-[10px] text-muted-foreground/40">|</span>
                        <button
                            type="button"
                            onClick={() => void restore()}
                            disabled={isRestoring}
                            className="flex items-center gap-1 text-[12px] font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
                        >
                            {isRestoring && <Loader2 size={11} className="animate-spin" />}
                            {t('mypage.subscription.restore')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
