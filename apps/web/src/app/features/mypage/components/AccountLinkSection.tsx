import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';

import { useLinkedAccounts } from '../../../hooks';
import { PhoneVerifySheet } from '../../auth/components/PhoneVerifySheet';
import { useSocialLinks } from '../hooks';
import { AppleIcon, GoogleIcon } from './SocialProviderIcons';

interface CredentialRowProps {
    label: string;
    icon?: ReactNode;
    linkedLabel?: string;
    isLinked: boolean;
    isBusy: boolean;
    onLink: () => void;
}

const CredentialRow = ({ label, icon, linkedLabel, isLinked, isBusy, onLink }: CredentialRowProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex w-full items-center justify-between py-3 pl-4 pr-3">
            <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
                {icon}
                {label}
            </span>
            {isLinked ? (
                <span className="text-[14px] text-muted-foreground">
                    {linkedLabel ?? t('mypage.accountInfo.social.linked')}
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

export const AccountLinkSection = () => {
    const { t } = useTranslation();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { isLinked, linkProvider, isLinking, socialState } = useSocialLinks();
    const linked = useLinkedAccounts();
    const [isPhoneSheetOpen, setIsPhoneSheetOpen] = useState(false);

    if (isGuest) return null;
    if (socialState === 'unknown' || linked.phone === 'unknown') return null;

    const offersApple = runtime.signIn.providerSignIn?.providers.includes('apple') ?? false;
    const hasNoCredential = linked.phone === 'absent' && linked.social === 'absent';

    return (
        <div className="flex flex-col gap-2">
            {hasNoCredential && (
                <p className="px-1 text-[13px] text-muted-foreground">{t('mypage.accountInfo.social.bannerTitle')}</p>
            )}

            <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                <CredentialRow
                    label={t('mypage.accountInfo.social.phone')}
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
                />
                {offersApple && (
                    <CredentialRow
                        label="Apple"
                        icon={<AppleIcon />}
                        isLinked={isLinked('apple')}
                        isBusy={isLinking}
                        onLink={() => void linkProvider('apple')}
                    />
                )}
            </div>

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
