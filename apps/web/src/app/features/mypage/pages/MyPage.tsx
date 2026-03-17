import { ChevronRight, ChevronDown, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { getMobileAppInfo, postMessage } from '@chatic/app-messages';
import { useDeviceInfo } from '@chatic/device-utils';
import { getStoreUrl } from '@chatic/shared';
import { useTheme } from '@chatic/theme';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import { useLocalProfileStore, useOnboardingStore, useWebCoreStore } from '@chatic/web-core';

import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { LanguageSelectSheet, LogoutDialog } from '../components';

export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const isGuest = useWebCoreStore(s => s.isGuest);
    const profile = useWebCoreStore(s => s.profile);
    const logout = useWebCoreStore(s => s.logout);
    const { setTheme, isDarkTheme } = useTheme();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const localProfile = useLocalProfileStore();
    const { resetOnboarding } = useOnboardingStore();

    // Merge local overrides with server profile (local > nick > name)
    const displayName = localProfile.name ?? profile?.$user?.nick ?? profile?.$user?.name;
    const displayImageUrl = localProfile.imageData ?? profile?.$user?.imageUrl;
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);

    const handleLogout = () => {
        logout();
        window.location.href = '/auth/login';
    };

    const handleProfileClick = () => {
        // Profile dropdown - for now, just navigate to edit
        navigate('/mypage/edit');
    };

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleUpdateClick = () => {
        const storeUrl = getStoreUrl(deviceInfo?.platform);
        if (!storeUrl) return;

        const { isOnMobileApp } = getMobileAppInfo();
        if (isOnMobileApp) {
            postMessage({ type: 'OpenURL', data: { url: storeUrl } });
        } else {
            window.open(storeUrl, '_blank');
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background pb-32 pt-4 pt-safe-top">
            {/* Profile Section */}
            <div className="px-5 pb-3">
                {isGuest ? (
                    <button onClick={() => navigate('/mypage/login')} className="flex flex-col gap-1.5 text-left">
                        <div className="flex items-center gap-1">
                            <span className="text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                {t('mypage.loginPrompt')}
                            </span>
                            <ChevronRight size={18} className="text-foreground" />
                        </div>
                        <p className="text-[14px] text-muted-foreground">{t('mypage.loginDescription')}</p>
                    </button>
                ) : (
                    <button onClick={handleProfileClick} className="flex items-center gap-[9px]">
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                            {displayImageUrl ? (
                                <img
                                    src={displayImageUrl}
                                    alt="Profile"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <User size={20} className="text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1">
                                <h2 className="max-w-[200px] truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                                    {displayName}
                                </h2>
                                <ChevronDown size={18} className="text-muted-foreground" />
                            </div>
                            <p className="text-[14px] text-muted-foreground">{profile?.$user?.email}</p>
                        </div>
                    </button>
                )}
            </div>

            {/* Menu Cards Container */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* My Info Card - Logged in only */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => navigate('/mypage/account')}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">
                                {t('mypage.accountInfo.title')}
                            </span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                    </div>
                )}

                {/* Settings Card - For all users (including guests) */}
                <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <div className="flex items-center justify-between py-3 pl-4 pr-3">
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.darkMode')}</span>
                        <Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />
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
                    <button
                        onClick={() => {
                            resetOnboarding();
                            navigate('/', { replace: true });
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
                        onClick={() => navigate('/mypage/policy')}
                        className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                    >
                        <span className="text-[15px] font-medium text-foreground">{t('mypage.policy.title')}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                    {versionInfo?.shouldUpdate &&
                    (deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android') ? (
                        <button
                            onClick={handleUpdateClick}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-[15px] font-medium text-foreground">
                                    {t('mypage.appVersion')}
                                </span>
                                <span className="text-[13px] text-muted-foreground">
                                    {`v${versionInfo?.appVersion} (App) / v${versionInfo?.webVersion} (Web)`}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[14px] font-medium text-primary">
                                    {t('mypage.updateAvailable')}
                                </span>
                                <ChevronRight size={18} className="text-primary" />
                            </div>
                        </button>
                    ) : (
                        <div className="flex items-center justify-between py-3 pl-4 pr-3">
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-[15px] font-medium text-foreground">
                                    {t('mypage.appVersion')}
                                </span>
                                <span className="text-[13px] text-muted-foreground">
                                    {deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android'
                                        ? `v${versionInfo?.appVersion} (App) / v${versionInfo?.webVersion} (Web)`
                                        : `v${versionInfo?.webVersion}`}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Logout Card - Logged in only */}
                {!isGuest && (
                    <div className="rounded-[18px] bg-card px-0.5 py-1.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => setIsLogoutDialogOpen(true)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <span className="text-[15px] font-medium text-foreground">{t('mypage.logout')}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
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
        </div>
    );
};
