import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

interface SubscriptionRequiredDialogProps {
    open: boolean;
    onClose: () => void;
}

export const SubscriptionRequiredDialog = ({ open, onClose }: SubscriptionRequiredDialogProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    if (!open) return null;

    const handleSubscribe = () => {
        onClose();
        navigate('/mypage/subscription');
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(34,35,37,0.38)]"
            onClick={onClose}
        >
            <div
                className="mx-[43px] w-full max-w-[288px] rounded-[12px] bg-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] dark:bg-card"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col items-center gap-2 px-[22px] py-[22px]">
                    <p className="whitespace-pre-line text-center text-[18px] font-semibold leading-[1.5] text-foreground">
                        {t('subscriptionRequired.title')}
                    </p>
                    <p className="whitespace-pre-line text-center text-[16px] font-medium leading-[1.45] tracking-[-0.01em] text-[#84888F]">
                        {t('subscriptionRequired.description')}
                    </p>
                </div>

                <div className="flex border-t border-[#EAEAEC]">
                    <button
                        onClick={onClose}
                        className="flex flex-1 items-center justify-center border-r border-[#EAEAEC] py-[14px] text-[16px] font-medium leading-[1.5] tracking-[-0.01em] text-[#84888F]"
                    >
                        {t('subscriptionRequired.cancel')}
                    </button>
                    <button
                        onClick={handleSubscribe}
                        className="flex flex-1 items-center justify-center py-[14px] text-[16px] font-semibold leading-[1.5] tracking-[-0.01em] text-foreground"
                    >
                        {t('subscriptionRequired.subscribe')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
