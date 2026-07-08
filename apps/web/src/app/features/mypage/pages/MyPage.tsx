import { ChevronRight, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoreUrl, useNavigateWithTransition } from '@chatic/shared';

import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useDeviceInfo } from '@chatic/device-utils';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import { useSessionSelection } from '@chatic/web-core';
import { useSessionProfile } from '@chatic/app-runtime';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';

import { BottomNavigation } from '../../../ui/components/BottomNavigation';
import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog } from '../components';
import { useAppIcon } from '../hooks';
import { useMyUser, useTheme } from '../../../hooks';
import { useDebugMode } from '../../debug';
import { ROUTES } from '../../../routes/paths';

export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { isGuest, isCloudActive } = useSessionProfile();
    const { selectedCloudId } = useSessionSelection();
    const myUser = useMyUser();

    const { setTheme, isDarkTheme } = useTheme();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const { resetOnboarding, blurLastMessage, setBlurLastMessage } = usePreferenceStore();
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

    // Logout + local cache teardown is handled by the shared /auth/logout flow (LogoutPage).
    const handleLogout = () => {
        navigate(ROUTES.auth.logout);
    };

    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    const handleProfileClick = () => {
        navigate(isDefaultCloud ? ROUTES.mypage.account.edit : ROUTES.mypage.account.cloudProfile);
    };

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleUpdateClick = () => {
        const storeUrl = getStoreUrl(deviceInfo?.platform);
        if (!storeUrl) return;

        const isOnMobileApp = isNative();
        if (isOnMobileApp) {
            appBridge.openURL(storeUrl);
        } else {
            window.open(storeUrl, '_blank');
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pb-32 pt-4 overflow-y-auto">
            {/* Profile Section */}
            <div className="px-5 pb-3 pt-safe-top">
                {/* Show the sign-in prompt only for guests; once a real relay login exists
                    (userRole 'user' → isGuest false), show the profile instead of "Sign in". */}
                {isGuest ? (
                    <button onClick={() => navigate(ROUTES.mypage.login)} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                {t('mypage.loginPrompt')}
                            </span>
                            <ChevronRight size={18} className="text-foreground" />
                        </div>
                        <p className="text-[14px] text-muted-foreground">{t('mypage.loginDescription')}</p>
                    </button>
                ) : isDefaultCloud ? (
                    <div className="flex items-center gap-[9px]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {displayImageUrl ? (
                                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={20} className="text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex flex-col items-start gap-0.5">
                            <h2 className="max-w-[200px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                {displayName}
                            </h2>
                            <p className="text-[14px] text-muted-foreground">{myUser?.email}</p>
                        </div>
                    </div>
                ) : (
                    <button onClick={handleProfileClick} className="flex items-center gap-[9px]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {displayImageUrl ? (
                                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User size={20} className="text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex flex-col items-start gap-0.5">
                            <h2 className="max-w-[200px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                {displayName}
                            </h2>
                            <p className="text-[14px] text-muted-foreground">{myUser?.email}</p>
                        </div>
                    </button>
                )}
            </div>

            {/* Menu Cards Container */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* My Info Card */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => navigate(ROUTES.mypage.account.info)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">
                                {t('mypage.accountInfo.title')}
                            </span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                    </div>
                )}

                {/* Subscription & Account Management Card - Cloud user only */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => navigate(ROUTES.subscription.root)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">
                                {t('mypage.subscription.title')}
                            </span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        {!isGuest && isCloudActive && (
                            <>
                                <div className="h-2" />
                                <button
                                    onClick={() => navigate(ROUTES.mypage.account.manage)}
                                    className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                                >
                                    <span className="text-[15px] font-medium text-foreground">
                                        {t('mypage.accountManage.title')}
                                    </span>
                                    <ChevronRight size={18} className="text-muted-foreground" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Settings Card - For all users (including guests) */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <div className="flex items-center justify-between py-3 pl-4 pr-3">
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.darkMode')}</span>
                        <Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />
                    </div>
                    <div className="flex items-center justify-between py-3 pl-4 pr-3">
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.messagePreview')}</span>
                        <Switch checked={!blurLastMessage} onCheckedChange={v => setBlurLastMessage(!v)} />
                    </div>
                    <button
                        onClick={() => setIsLanguageSheetOpen(true)}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.languageSettings')}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[14px] text-muted-foreground">{currentLanguageLabel}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </div>
                    </button>
                    {isNative() && isIconChangeSupported && (
                        <button
                            onClick={() => setIsAppIconSheetOpen(true)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">
                                {t('mypage.appIconSettings')}
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-[14px] text-muted-foreground">{currentIconLabel}</span>
                                <ChevronRight size={18} className="text-muted-foreground" />
                            </div>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            resetOnboarding();
                            navigate(ROUTES.root, { replace: true });
                        }}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.viewOnboarding')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                </div>

                {/* Policy and Version Card */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <button
                        onClick={() => navigate(ROUTES.mypage.policy.root)}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.policy.title')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                    <button
                        onClick={registerTap}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3 text-left"
                    >
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="text-[15px] font-medium text-foreground">{t('mypage.appVersion')}</span>
                            <span className="text-[13px] text-muted-foreground">
                                {deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android'
                                    ? `v${versionInfo?.appVersion} (App) / v${versionInfo?.webVersion} (Web)`
                                    : `v${versionInfo?.webVersion}`}
                            </span>
                        </div>
                        {versionInfo?.shouldUpdate &&
                            (deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android') && (
                                <div
                                    role="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        handleUpdateClick();
                                    }}
                                    className="flex items-center gap-1"
                                >
                                    <span className="text-[14px] font-medium text-primary">
                                        {t('mypage.updateAvailable')}
                                    </span>
                                    <ChevronRight size={18} className="text-primary" />
                                </div>
                            )}
                    </button>
                    {isDebugMode && (
                        <>
                            <button
                                onClick={() => navigate(ROUTES.debug.root)}
                                className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                            >
                                <span className="text-[15px] font-medium text-destructive">Debug Mode</span>
                                <ChevronRight size={18} className="text-destructive" />
                            </button>
                        </>
                    )}
                </div>

                {/* Logout */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => setIsLogoutDialogOpen(true)}
                            className="flex w-full items-center py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-destructive">{t('mypage.logout')}</span>
                        </button>
                    </div>
                )}
            </div>

            <BottomNavigation />

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
