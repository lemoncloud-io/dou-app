import { ChevronRight, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useLinkedAccounts } from '../../../hooks/useLinkedAccounts';
import { useNavigateToLogin } from '../hooks/useNavigateToLogin';

interface PhoneVerifyBannerProps {
    onClose: () => void;
}

export const PhoneVerifyBanner = ({ onClose }: PhoneVerifyBannerProps) => {
    const { t } = useTranslation();
    const goToLogin = useNavigateToLogin();
    const { social } = useLinkedAccounts();

    const handleGoToSocialLogin = () => {
        onClose();
        goToLogin();
    };

    if (social === 'linked') return null;

    return (
        <div className="px-4">
            <button
                type="button"
                onClick={handleGoToSocialLogin}
                className="flex w-full items-center gap-2.5 rounded-[10px] bg-secondary px-4 py-3 text-left"
            >
                <UserRound className="size-5 shrink-0 text-main-accent" />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-semibold leading-[1.4] text-foreground">
                        {t('phoneVerify.socialFirstTitle')}
                    </span>
                    <span className="text-[12px] font-medium leading-[1.4] text-description">
                        {t('phoneVerify.socialFirstDescription')}
                    </span>
                </div>
                <ChevronRight className="size-5 shrink-0 text-[#9FA2A7]" />
            </button>
        </div>
    );
};
