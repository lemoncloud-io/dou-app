import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';

import { useRestorePurchases } from '../../hooks';

interface PolicyFooterProps {
    onOpenPolicy: (path: string) => void;
}

export const PolicyFooter = ({ onOpenPolicy }: PolicyFooterProps) => {
    const { t } = useTranslation();
    const { restore, isRestoring, canRestore, notice } = useRestorePurchases();

    return (
        <div className="mt-4 w-full max-w-reading rounded-[12px] bg-muted/50 px-4 py-3">
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
            {notice}
        </div>
    );
};
