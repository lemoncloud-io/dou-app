import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { IconChevronRight, IconSettings, IconUserOutline, ListRow, MenuCard } from '@chatic/web-ui-kit';
import { useCloudSessionCatalog, useMembershipInfo } from '@chatic/web-core';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { BottomNavSpacer } from '../../../ui/components';
import { useMyUser } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

/**
 * MY hub — identity and the two account-scoped destinations (subscription, clouds). Device and app
 * preferences moved one depth down behind the header gear (SettingsPage), so this screen stays a
 * short identity card list rather than a settings dump.
 */
export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t } = useTranslation();
    const { isGuest } = useRuntimeProfile();
    const { data: membership } = useMembershipInfo();
    // Owned clouds only (the relay catalog); invited clouds are deliberately absent — you cannot
    // release someone else's cloud, so they must not summon the 클라우드 정보 row.
    const { clouds } = useCloudSessionCatalog();
    const myUser = useMyUser();

    const displayName = myUser?.name;
    const displayImageUrl = myUser?.photo;

    const profileAvatar = (
        <span className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full border border-avatar-ring bg-muted">
            {displayImageUrl ? (
                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
                <IconUserOutline size={26} className="text-placeholder" />
            )}
        </span>
    );

    // A membership decides the destination, not the label: the row is "구독 정보" either way, but
    // someone who has never subscribed wants to know what a cloud even is, so they get the guide
    // rather than the plan picker or an empty membership screen.
    const hasSubscription = membership?.isValid === true;
    // Gate on OWNERSHIP, not on `isCloudActive`. The latter means "currently switched into a
    // non-default cloud", which hid the only release path whenever the user sat on 두유 홈 — including
    // the exact case ExcessCloudBanner deep-links here for (over the allowance after a downgrade),
    // and a lapsed subscriber whose leftover clouds still need deleting.
    const hasOwnedCloud = clouds.length > 0;

    // The header shows the RELAY account's data (name/email/photo) — the same record whichever cloud
    // is connected. It opens 내 정보, the account hub: profile editing, social links and withdrawal
    // all hang off it, and this row is now their only way in.
    const handleProfileClick = () => {
        navigate(ROUTES.mypage.account.info);
    };

    return (
        // Trailing clearance for the floating nav comes from BottomNavSpacer at the end of the
        // content, not from padding on this container — see BottomNavSpacer for why.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pt-safe-top">
            <header className="flex items-center justify-between px-4 py-3">
                <h1 className="text-[22px] font-bold tracking-[-0.11px] text-foreground">{t('mypage.title')}</h1>
                <button
                    onClick={() => navigate(ROUTES.mypage.settings.root)}
                    aria-label={t('mypage.settings.openLabel')}
                    className="flex size-9 items-center justify-center rounded-full active:bg-muted/50"
                >
                    <IconSettings size={22} className="text-foreground" />
                </button>
            </header>

            <div className="flex flex-col gap-[18px] px-4 pt-2">
                {/* Account profile card — account-level profile (name/email/photo), not cloud/site. */}
                <MenuCard>
                    {isGuest ? (
                        <ListRow
                            title={t('mypage.loginPrompt')}
                            subtitle={t('mypage.loginDescription')}
                            trailing={<Chevron />}
                            onClick={goToLogin}
                        />
                    ) : (
                        <ListRow
                            leading={profileAvatar}
                            title={displayName}
                            subtitle={myUser?.email}
                            trailing={<Chevron />}
                            onClick={handleProfileClick}
                            className="py-3"
                        />
                    )}
                </MenuCard>

                {!isGuest && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.subscription.hubEntry')}
                            trailing={<Chevron />}
                            onClick={() =>
                                navigate(hasSubscription ? ROUTES.subscription.root : ROUTES.subscription.guide)
                            }
                        />
                    </MenuCard>
                )}

                {!isGuest && hasOwnedCloud && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.cloudManage.hubEntry')}
                            trailing={<Chevron />}
                            onClick={() => navigate(ROUTES.mypage.cloud.manage)}
                        />
                    </MenuCard>
                )}
            </div>

            <BottomNavSpacer />
        </div>
    );
};
