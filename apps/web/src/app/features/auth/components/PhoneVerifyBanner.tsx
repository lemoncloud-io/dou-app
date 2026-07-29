import { ChevronRight, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';

interface PhoneVerifyBannerProps {
    /** Dismisses the verification screen before leaving for the social-login page. */
    onClose: () => void;
}

/**
 * Account-split defense banner, shown ABOVE the phone verification form (05-client-guide.md
 * §계정 갈라짐): a user who ever signed up socially and now verifies a number on a fresh device
 * would mint a SEPARATE user that can never be merged. This notice — routing to the existing
 * social-login bridge page — is the only defense, so it leads the screen.
 */
export const PhoneVerifyBanner = ({ onClose }: PhoneVerifyBannerProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const handleGoToSocialLogin = () => {
        // Leave the verification flow first so the dialog is not left mounted under the login page.
        onClose();
        navigate(ROUTES.mypage.login);
    };

    return (
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
    );
};
