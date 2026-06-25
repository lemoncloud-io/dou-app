import { ChevronRight, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoreUrl, useNavigateWithTransition } from '@chatic/shared';

import { isNative, webClient } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useDeviceInfo } from '@chatic/device-utils';
import { useTheme } from '@chatic/theme';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import {
    cloudCore,
    useAppPreferenceStore,
    useDynamicProfile,
    useOnboardingStore,
    UserType,
    useUserContext,
    useWebCoreStore,
} from '@chatic/web-core';
import { useLogout } from '@chatic/web-core';

import { BottomNavigation } from '../../../shared/components/BottomNavigation';
import { useTotalUnreadCount } from '../../../shared/hooks/useTotalUnreadCount';
import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog } from '../components';
import { DEBUG_STORAGE_KEY } from '../consts';
import { useCacheMutations } from '../../../shared/hooks/useCacheMutations';
import type { AppIconOption } from '@chatic/app-messages';
import { ROUTES } from '../../../routes/paths';

export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { userType } = useUserContext();
    const profile = useDynamicProfile();
    const selectedCloudId = cloudCore.getSelectedCloudId() ?? 'default';

    const { mutate: logout } = useLogout();
    const registerLogoutCallback = useWebCoreStore(s => s.registerLogoutCallback);
    const { setTheme, isDarkTheme } = useTheme();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const { resetOnboarding } = useOnboardingStore();
    const { blurLastMessage, setBlurLastMessage } = useAppPreferenceStore();
    const { clearAllCache } = useCacheMutations();
    const totalUnread = useTotalUnreadCount();

    const displayName = profile?.$user?.name;
    const displayImageUrl = profile?.$user?.photo;
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);
    const [isDebugMode, setIsDebugMode] = useState(() => sessionStorage.getItem(DEBUG_STORAGE_KEY) === 'true');
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isIconChangeSupported, setIsIconChangeSupported] = useState(false);
    const [currentIcon, setCurrentIcon] = useState<string | null>('default');
    const [availableIcons, setAvailableIcons] = useState<AppIconOption[]>([]);
    const [isAppIconSheetOpen, setIsAppIconSheetOpen] = useState(false);

    useEffect(() => {
        if (isNative()) {
            webClient
                .request({ type: 'FetchAppIcon', data: {} })
                .then(res => {
                    if (res.success && res.data) {
                        setIsIconChangeSupported(res.data.supported);
                        setCurrentIcon(res.data.iconName);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch app icon status:', err);
                });

            webClient
                .request({ type: 'FetchAppIconList', data: {} })
                .then(res => {
                    if (res.success && res.data) {
                        setAvailableIcons(res.data.availableIcons);
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch app icon list:', err);
                });
        }
    }, []);

    const handleIconSelect = async (iconId: string | null) => {
        try {
            const res = await webClient.request({
                type: 'ChangeAppIcon',
                data: { iconName: iconId },
            });
            if (res.success && res.data?.success) {
                setCurrentIcon(res.data.iconName ?? 'default');
                return true;
            }
        } catch (err) {
            console.error('Failed to change app icon:', err);
        }
        return false;
    };

    const currentIconLabel = (() => {
        const isDefault = currentIcon === null || currentIcon === 'default';
        if (isDefault) return t('mypage.appIcon.default');

        const found = availableIcons.find(icon => icon.id === currentIcon);
        if (!found) return t('mypage.appIcon.default');

        const translationKey = `mypage.appIcon.${found.id}`;
        const translated = t(translationKey);
        return translated !== translationKey ? translated : found.label;
    })();

    useEffect(() => {
        return registerLogoutCallback(() => sessionStorage.removeItem(DEBUG_STORAGE_KEY));
    }, [registerLogoutCallback]);

    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);

    const handleLogout = () => {
        void clearAllCache();
        logout();
    };

    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    const handleProfileClick = () => {
        navigate(isDefaultCloud ? ROUTES.mypage.account.edit : ROUTES.mypage.account.cloudProfile);
    };

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleVersionTap = () => {
        tapCountRef.current += 1;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = setTimeout(() => {
            tapCountRef.current = 0;
        }, 3000);

        if (tapCountRef.current >= 10) {
            tapCountRef.current = 0;
            sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
            setIsDebugMode(true);
        }
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
                {userType === UserType.TEMP_ACCOUNT || userType === UserType.INVITED ? (
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
                            <p className="text-[14px] text-muted-foreground">{profile?.$user?.email}</p>
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
                            <p className="text-[14px] text-muted-foreground">{profile?.$user?.email}</p>
                        </div>
                    </button>
                )}
            </div>

            {/* Menu Cards Container */}
            <div className="flex flex-col gap-[18px] px-4 pt-4">
                {/* My Info Card */}
                {(userType === UserType.SOCIAL_WITH_CLOUD ||
                    userType === UserType.INVITED_WITH_CLOUD ||
                    userType === UserType.SOCIAL_NO_CLOUD) && (
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
                {(userType === UserType.SOCIAL_WITH_CLOUD ||
                    userType === UserType.INVITED_WITH_CLOUD ||
                    userType === UserType.SOCIAL_NO_CLOUD) && (
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
                        {(userType === UserType.SOCIAL_WITH_CLOUD || userType === UserType.INVITED_WITH_CLOUD) && (
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
                        onClick={handleVersionTap}
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
                                onClick={() => navigate(ROUTES.mypage.debug.root)}
                                className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                            >
                                <span className="text-[15px] font-medium text-destructive">Debug Mode</span>
                                <ChevronRight size={18} className="text-destructive" />
                            </button>
                        </>
                    )}
                </div>

                {/* Logout */}
                {userType !== UserType.TEMP_ACCOUNT && userType !== UserType.INVITED && (
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

            <BottomNavigation totalUnread={totalUnread} />

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
                onSelectIcon={handleIconSelect}
            />
        </div>
    );
};
