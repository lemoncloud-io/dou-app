import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuntimeProfile } from '@chatic/app-runtime';
import { isNative } from '@chatic/bridges';

import { useLinkedAccounts } from '../../../hooks';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import { SOCIAL_UNLINK_ENABLED } from '../flags';
import { useSocialLinks } from '../hooks';
import { AppleIcon, GoogleIcon } from './SocialProviderIcons';

interface CredentialRowProps {
    label: string;
    icon?: ReactNode;
    /** Rendered instead of the link button once the credential is on the account. */
    linkedLabel?: string;
    isLinked: boolean;
    isBusy: boolean;
    onLink: () => void;
    /** Omitted where there is nothing to unlink yet (the phone row has no endpoint either way). */
    onUnlink?: () => void;
}

const CredentialRow = ({ label, icon, linkedLabel, isLinked, isBusy, onLink, onUnlink }: CredentialRowProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex w-full items-center justify-between py-3 pl-4 pr-3">
            <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
                {icon}
                {label}
            </span>
            {isLinked ? (
                <span className="flex items-center gap-2">
                    <span className="text-[14px] text-muted-foreground">
                        {linkedLabel ?? t('mypage.accountInfo.social.linked')}
                    </span>
                    {/* Stub: no unlink endpoint yet (ADR-0033 request #7, still open in ADR-0042) —
                        disabled rather than faking a success. `title` gives a hover hint without
                        adding new layout. */}
                    {onUnlink && (
                        <button
                            onClick={onUnlink}
                            disabled={!SOCIAL_UNLINK_ENABLED}
                            title={SOCIAL_UNLINK_ENABLED ? undefined : t('mypage.accountInfo.social.unlinkComingSoon')}
                            className="text-[13px] font-medium text-muted-foreground underline decoration-dotted disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {t('mypage.accountInfo.social.unlink')}
                        </button>
                    )}
                </span>
            ) : (
                <button
                    onClick={onLink}
                    disabled={isBusy}
                    className="text-[14px] font-medium text-primary disabled:opacity-50"
                >
                    {t('mypage.accountInfo.social.link')}
                </button>
            )}
        </div>
    );
};

/**
 * Account-linking section for AccountInfoPage — which credentials (phone, social) prove this account.
 *
 * Reuses AccountInfoPage's own card/row classes (no Figma node for this area — see
 * apps/web/docs/feature/account/social-links.md "설계 원칙").
 *
 * **The section stays silent until the server has spoken.** `link$` is what makes this screen honest
 * (ADR-0042 §7), and while it reads `'unknown'` — the profile has not landed, or the server never built
 * the slot — neither "linked" nor "link it" is a claim we can back. Rendering nothing is the only
 * answer that cannot mislead about an account-security control.
 *
 * Renders nothing for a guest either: linking requires an already-main-user session, and MyPage already
 * hides the entry point, so this is a defensive guard for direct navigation.
 */
export const AccountLinkSection = () => {
    const { t } = useTranslation();
    const { isGuest } = useRuntimeProfile();
    const { isLinked, linkProvider, requestUnlink, isLinking, socialState } = useSocialLinks();
    const linked = useLinkedAccounts();
    const [isPhoneSheetOpen, setIsPhoneSheetOpen] = useState(false);

    if (isGuest) return null;
    // Both slots ride on the same read, so one unknown means the whole section is guessing.
    if (socialState === 'unknown' || linked.phone === 'unknown') return null;

    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    // Server truth now, not a per-device guess: an account with neither credential is one device wipe
    // away from being unrecoverable, which is what the nudge is about.
    const hasNoCredential = linked.phone === 'absent' && linked.social === 'absent';

    return (
        <div className="flex flex-col gap-2">
            {/* Account-split defense (client-guide.md §알아 둘 제약): nudge toward a second credential
                before a future device creates a separate, unmergeable account. */}
            {hasNoCredential && (
                <p className="px-1 text-[13px] text-muted-foreground">{t('mypage.accountInfo.social.bannerTitle')}</p>
            )}

            <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <CredentialRow
                    label={t('mypage.accountInfo.social.phone')}
                    // The masked tail is the only form of the number the server will hand back.
                    linkedLabel={
                        linked.phoneHint
                            ? t('mypage.accountInfo.social.phoneMasked', { last4: linked.phoneHint })
                            : undefined
                    }
                    isLinked={linked.phone === 'linked'}
                    isBusy={isPhoneSheetOpen}
                    onLink={() => setIsPhoneSheetOpen(true)}
                />
                <CredentialRow
                    label="Google"
                    icon={<GoogleIcon />}
                    isLinked={isLinked('google')}
                    isBusy={isLinking}
                    onLink={() => void linkProvider('google')}
                    onUnlink={requestUnlink}
                />
                {isIOS && (
                    <CredentialRow
                        label="Apple"
                        icon={<AppleIcon />}
                        isLinked={isLinked('apple')}
                        isBusy={isLinking}
                        onLink={() => void linkProvider('apple')}
                        onUnlink={requestUnlink}
                    />
                )}
            </div>

            {/* `link`, never `login`: this session is already a main user, so proving a number hangs it
                on the session instead of opening a new one. No token comes back (ADR-0042 §3). */}
            {isPhoneSheetOpen && (
                <PhoneVerifySheet
                    mode="link"
                    onVerified={() => setIsPhoneSheetOpen(false)}
                    onClose={() => setIsPhoneSheetOpen(false)}
                />
            )}
        </div>
    );
};
