import { ChevronRight, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Concrete module, not the hooks barrel: that barrel pulls the whole app-runtime surface, and this
// component renders inside a dialog the auth suites load under jsdom.
import { useLinkedAccounts } from '../../../hooks/useLinkedAccounts';
import { useNavigateToLogin } from '../hooks/useNavigateToLogin';

interface PhoneVerifyBannerProps {
    /** Dismisses the verification screen before leaving for the social-login page. */
    onClose: () => void;
}

/**
 * Account-split defense banner, shown ABOVE the phone verification form (05-client-guide.md
 * §계정 갈라짐): a user who ever signed up socially and now verifies a number on a fresh device
 * would mint a SEPARATE user that can never be merged. This notice — routing to the existing
 * social-login bridge page — is the only defense, so it leads the screen.
 *
 * It hides itself once that split is impossible. Owning both the decision and its outer padding is
 * deliberate: the screen stacks its sections with `gap-8`, so a caller-side wrapper around a
 * self-hiding child would leave a stray gap where the banner used to be.
 */
export const PhoneVerifyBanner = ({ onClose }: PhoneVerifyBannerProps) => {
    const { t } = useTranslation();
    const goToLogin = useNavigateToLogin();
    const { social } = useLinkedAccounts();

    const handleGoToSocialLogin = () => {
        // Leave the verification flow first so the dialog is not left mounted under the login page.
        onClose();
        goToLogin();
    };

    // Already proved a social account, so verifying a number here hangs it on THAT user — there is no
    // second account to split into, and "log in socially first" would send them through a login they
    // have already done.
    //
    // Only a definite `'linked'` hides it. `'unknown'` (profile not landed, or a `link$` slot the
    // server never built) keeps the banner up: this is the one defense against an unmergeable
    // account, so the honest failure is showing it to someone who did not need it (ADR-0042 §5).
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
