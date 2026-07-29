import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoreUrl, useNavigateWithTransition } from '@chatic/shared';

import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useDeviceInfo } from '@chatic/device-utils';
import { IconChevronRight, IconUser, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';
import { useMembershipInfo } from '@chatic/web-core';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';

import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog } from '../components';
import { BottomNavSpacer } from '../../../ui/components';
import { useAppIcon, useDevicePushMute } from '../hooks';
import { useMyUser, useTheme } from '../../../hooks';
import { debugOverlayActions, useDebugMode } from '../../debug';
import { ROUTES } from '../../../routes/paths';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { isGuest, isCloudActive } = useRuntimeProfile();
    const { data: membership } = useMembershipInfo();
    const myUser = useMyUser();

    const { setTheme, isDarkTheme } = useTheme();
    const { pushEnabled, setPushEnabled, isSupported: pushSupported } = useDevicePushMute();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const { resetOnboarding, blurLastMessage, setBlurLastMessage, issueReportHidden, setIssueReportHidden } =
        usePreferenceStore();
    const { isEnabled: isDebugMode, registerTap } = useDebugMode();
    const {
        isSupported: isIconChangeSupported,
        currentIcon,
        availableIcons,
        selectIcon,
        currentIconLabel,
    } = useAppIcon();

    const displayName = myUser?.name;
    const displayImageUrl = myUser?.photo;
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);
    const [isAppIconSheetOpen, setIsAppIconSheetOpen] = useState(false);

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);
    const profileAvatar = (
        <span className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-avatar-ring bg-muted">
            {displayImageUrl ? (
                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
                <IconUser size={20} className="text-placeholder" />
            )}
        </span>
    );
    const profileText = (
        <span className="flex flex-col items-start gap-0.5">
            <span className="max-w-[200px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                {displayName}
            </span>
            <span className="text-[14px] text-description">{myUser?.email}</span>
        </span>
    );
    // Subscription status label — "구독 이용 중" when a membership is valid, else "구독 관리".
    // Free-trial D-N state is intentionally out of scope (no reliable server "in trial" flag).
    const hasSubscription = membership?.isValid === true;

    const isMobilePlatform = deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android';
    // iOS only: Android has no live-version source yet (see ADR-0033), so the update row is
    // gated on platform explicitly rather than relying solely on shouldUpdate staying false there.
    const showUpdate = !!versionInfo?.shouldUpdate && deviceInfo?.platform === 'ios';

    // Logout + local cache teardown is handled by the shared /auth/logout flow (LogoutPage).
    const handleLogout = () => {
        navigate(ROUTES.auth.logout);
    };

    // The header shows account-level data (name/email/photo), so tapping it opens the account profile
    // editor, which edits exactly that. The cloud-entity name editor is a separate, owner-gated screen
    // reachable from AccountInfoPage. No ownership gate here: any signed-in user can edit their own
    // profile.
    const handleProfileClick = () => {
        navigate(ROUTES.mypage.account.edit);
    };

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleUpdateClick = () => {
        if (isNative()) {
            appBridge.openStore();
            return;
        }

        const storeUrl = getStoreUrl(deviceInfo?.platform);
        if (!storeUrl) return;
        window.open(storeUrl, '_blank');
    };

    const versionText = isMobilePlatform
        ? `v${versionInfo?.appVersion} (App) / v${versionInfo?.webVersion} (Web)`
        : `v${versionInfo?.webVersion}`;

    return (
        // Trailing clearance for the floating nav comes from BottomNavSpacer at the end of the
        // content, not from padding on this container — see BottomNavSpacer for why.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pt-4">
            {/* Account profile header — account-level profile (name/email/photo), not cloud/site.
                Tapping it opens the account profile editor (/mypage/edit). */}
            <div className="px-5 pb-3 pt-safe-top">
                {isGuest ? (
                    <button onClick={() => navigate(ROUTES.mypage.login)} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                {t('mypage.loginPrompt')}
                            </span>
                            <IconChevronRight className="size-[18px] text-foreground" />
                        </div>
                        <p className="text-[14px] text-description">{t('mypage.loginDescription')}</p>
                    </button>
                ) : (
                    <button onClick={handleProfileClick} className="flex items-center gap-[9px] text-left">
                        {profileAvatar}
                        {profileText}
                    </button>
                )}
            </div>

            {/* Menu cards */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* My info */}
                {!isGuest && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.accountInfo.title')}
                            trailing={<Chevron />}
                            onClick={() => navigate(ROUTES.mypage.account.info)}
                        />
                    </MenuCard>
                )}

                {/* Subscription + account management */}
                {!isGuest && (
                    <MenuCard>
                        <ListRow
                            title={hasSubscription ? t('mypage.subscription.inUse') : t('mypage.subscription.title')}
                            trailing={<Chevron />}
                            onClick={() => navigate(ROUTES.subscription.root)}
                        />
                        {isCloudActive && (
                            <ListRow
                                title={t('mypage.accountManage.title')}
                                trailing={<Chevron />}
                                onClick={() => navigate(ROUTES.mypage.account.manage)}
                            />
                        )}
                    </MenuCard>
                )}

                {/* Settings — kept from the previous design, restyled onto the DS card. */}
                <MenuCard>
                    {/* Device-global push mute. ON = notifications received (muted:false). Outside a
                        native shell no push device exists (the write would 404), so the toggle is
                        disabled with a hint instead of erroring — see useDevicePushMute. */}
                    <ListRow
                        title={t('mypage.pushNotifications')}
                        subtitle={pushSupported ? undefined : t('mypage.push.appOnly')}
                        trailing={
                            <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} disabled={!pushSupported} />
                        }
                    />
                    <ListRow
                        title={t('mypage.darkMode')}
                        trailing={<Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />}
                    />
                    <ListRow
                        title={t('mypage.messagePreview')}
                        trailing={<Switch checked={!blurLastMessage} onCheckedChange={v => setBlurLastMessage(!v)} />}
                    />
                    <ListRow
                        title={t('mypage.issueReportButton')}
                        trailing={
                            <Switch checked={!issueReportHidden} onCheckedChange={v => setIssueReportHidden(!v)} />
                        }
                    />
                    <ListRow
                        title={t('mypage.languageSettings')}
                        trailing={
                            <span className="flex items-center gap-1">
                                <span className="text-[14px] text-description">{currentLanguageLabel}</span>
                                <Chevron />
                            </span>
                        }
                        onClick={() => setIsLanguageSheetOpen(true)}
                    />
                    {isNative() && isIconChangeSupported && (
                        <ListRow
                            title={t('mypage.appIconSettings')}
                            trailing={
                                <span className="flex items-center gap-1">
                                    <span className="text-[14px] text-description">{currentIconLabel}</span>
                                    <Chevron />
                                </span>
                            }
                            onClick={() => setIsAppIconSheetOpen(true)}
                        />
                    )}
                    <ListRow
                        title={t('mypage.viewOnboarding')}
                        trailing={<Chevron />}
                        onClick={() => {
                            resetOnboarding();
                            navigate(ROUTES.root, { replace: true });
                        }}
                    />
                </MenuCard>

                {/* Policy + version */}
                <MenuCard>
                    <ListRow
                        title={t('mypage.policy.title')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.policy.root)}
                    />
                    <ListRow
                        title={t('mypage.appVersion')}
                        trailing={
                            <span className="flex items-center gap-1">
                                <span className="text-[14px] text-description">{versionText}</span>
                                <Chevron />
                            </span>
                        }
                        onClick={registerTap}
                    />
                    {/* Update availability is its own row (design), shown only where a live check
                        exists — iOS only for now; Android has no live-version source yet. */}
                    {showUpdate && (
                        <ListRow
                            title={t('mypage.appVersion')}
                            trailing={
                                <span className="flex items-center gap-1">
                                    <span className="text-[14px] font-medium text-primary">
                                        {t('mypage.updateAvailable')}
                                    </span>
                                    <IconChevronRight className="size-[18px] text-primary" />
                                </span>
                            }
                            onClick={handleUpdateClick}
                        />
                    )}
                    {isDebugMode && (
                        <ListRow
                            title="Debug Mode"
                            destructive
                            trailing={<IconChevronRight className="size-[18px] text-destructive" />}
                            onClick={() => debugOverlayActions.open('expanded')}
                        />
                    )}
                </MenuCard>

                {/* Logout */}
                {!isGuest && (
                    <MenuCard>
                        <ListRow title={t('mypage.logout')} destructive onClick={() => setIsLogoutDialogOpen(true)} />
                    </MenuCard>
                )}
            </div>

            <BottomNavSpacer />

            {/* Logout Dialog */}
            <LogoutDialog
                isOpen={isLogoutDialogOpen}
                onClose={() => setIsLogoutDialogOpen(false)}
                onConfirm={handleLogout}
            />

            {/* Language Select Sheet */}
            <LanguageSelectSheet isOpen={isLanguageSheetOpen} onClose={() => setIsLanguageSheetOpen(false)} />

            {/* App Icon Select Sheet */}
            <AppIconSelectSheet
                isOpen={isAppIconSheetOpen}
                onClose={() => setIsAppIconSheetOpen(false)}
                currentIcon={currentIcon}
                availableIcons={availableIcons}
                onSelectIcon={selectIcon}
            />
        </div>
    );
};
