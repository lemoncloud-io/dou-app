import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuntimeProfile } from '@chatic/app-runtime';
import { isNative } from '@chatic/bridges';

import { SOCIAL_UNLINK_ENABLED } from '../flags';
import { useSocialLinks, type SocialProvider } from '../hooks';
import { AppleIcon, GoogleIcon } from './SocialProviderIcons';

interface ProviderRowProps {
    provider: SocialProvider;
    label: string;
    icon: ReactNode;
    isLinked: boolean;
    isLinking: boolean;
    onLink: (provider: SocialProvider) => void;
    onUnlink: () => void;
}

const ProviderRow = ({ provider, label, icon, isLinked, isLinking, onLink, onUnlink }: ProviderRowProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex w-full items-center justify-between py-3 pl-4 pr-3">
            <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
                {icon}
                {label}
            </span>
            {isLinked ? (
                <span className="flex items-center gap-2">
                    <span className="text-[14px] text-muted-foreground">{t('mypage.accountInfo.social.linked')}</span>
                    {/* Stub: no unlink endpoint yet (ADR-0033 request #7) — disabled rather than
                        faking a success. `title` gives a hover hint without adding new layout. */}
                    <button
                        onClick={onUnlink}
                        disabled={!SOCIAL_UNLINK_ENABLED}
                        title={SOCIAL_UNLINK_ENABLED ? undefined : t('mypage.accountInfo.social.unlinkComingSoon')}
                        className="text-[13px] font-medium text-muted-foreground underline decoration-dotted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {t('mypage.accountInfo.social.unlink')}
                    </button>
                </span>
            ) : (
                <button
                    onClick={() => onLink(provider)}
                    disabled={isLinking}
                    className="text-[14px] font-medium text-primary disabled:opacity-50"
                >
                    {t('mypage.accountInfo.social.link')}
                </button>
            )}
        </div>
    );
};

/**
 * Social-link section for AccountInfoPage — per-provider (google/apple) attach status.
 *
 * Reuses AccountInfoPage's own card/row classes (no Figma node for this track — see
 * apps/web/docs/feature/account/social-links.md "설계 원칙"). Renders nothing for a guest: the
 * entry point to this page is already gated to non-guests (MyPage hides "내 정보" for guests), and
 * `auth.attach-social` requires an already-main-user session, so this is a defensive no-op guard for
 * direct navigation rather than the primary gate.
 */
export const SocialLinkSection = () => {
    const { t } = useTranslation();
    const { isGuest } = useRuntimeProfile();
    const { isLinked, linkProvider, requestUnlink, isLinking } = useSocialLinks();

    if (isGuest) return null;

    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const hasAnyLinked = isLinked('google') || isLinked('apple');

    return (
        <div className="flex flex-col gap-2">
            {/* Account-split defense (client-guide.md §알아 둘 제약): nudge toward linking a social
                account before a future device creates a second, unmergeable account. Best-effort
                condition — "nothing linked on THIS device yet" is the closest available proxy for
                "phone-only", since there is no server source for the account's original sign-up
                method (see social-links.md). A user who actually signed up via Google still sees
                this once per device; re-linking is a harmless no-op, not a wrong action. No
                permanent "don't show again" store — re-evaluated every visit. */}
            {!hasAnyLinked && (
                <p className="px-1 text-[13px] text-muted-foreground">{t('mypage.accountInfo.social.bannerTitle')}</p>
            )}

            <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <ProviderRow
                    provider="google"
                    label="Google"
                    icon={<GoogleIcon />}
                    isLinked={isLinked('google')}
                    isLinking={isLinking}
                    onLink={linkProvider}
                    onUnlink={requestUnlink}
                />
                {isIOS && (
                    <ProviderRow
                        provider="apple"
                        label="Apple"
                        icon={<AppleIcon />}
                        isLinked={isLinked('apple')}
                        isLinking={isLinking}
                        onLink={linkProvider}
                        onUnlink={requestUnlink}
                    />
                )}
            </div>
        </div>
    );
};
