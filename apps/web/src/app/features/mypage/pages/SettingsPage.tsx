import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { runtime } from '@chatic/runtime';
import { haptics } from '../../../bridge/haptics';
import { useDeviceInfo } from '../../../hooks/useDeviceInfo';
import { IconChevronRight, IconSpinner, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog, PairingLogoutDialog } from '../components';
import { useAppIcon, useClearLocalCaches, useLanguagePreference } from '../hooks';
import { useOnboarding, useTheme } from '../../../hooks';
import { useAppUpdateStatus } from '../../appUpdate';
import { PageHeader } from '../../../ui/components';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { ROUTES } from '../../../routes/paths';
import { useDevicePairingEnabled } from '../../../hooks/useDevicePairingEnabled';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

export const SettingsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const { setTheme, isDarkTheme } = useTheme();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const { resetOnboarding } = useOnboarding();
    const { updateAvailable } = useAppUpdateStatus();
    const {
        isSupported: isIconChangeSupported,
        currentIcon,
        availableIcons,
        selectIcon,
        currentIconLabel,
    } = useAppIcon();

    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);
    const [isAppIconSheetOpen, setIsAppIconSheetOpen] = useState(false);

    const { preference: languagePreference } = useLanguagePreference();
    const currentLanguageLabel = t(`mypage.language.${languagePreference}`);
    const { clearLocalCaches, isClearing } = useClearLocalCaches();

    const isMobilePlatform = deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android';
    const showUpdateStatus = deviceInfo?.platform === 'ios';

    const goToLogout = () => navigate(ROUTES.auth.logout);
    const pairingEnabled = useDevicePairingEnabled();
    const pairingLogout = runtime.session.usePairingAwareLogout(goToLogout);
    const handleLogout = () => {
        setIsLogoutDialogOpen(false);
        if (pairingEnabled) void pairingLogout.start();
        else goToLogout();
    };

    const handleThemeToggle = () => {
        haptics.play('selection');
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleOpenStore = () => runtime.appShell.storeUpdate?.openStore();

    const versionText = isMobilePlatform
        ? `v${versionInfo?.appVersion} (App) / v${versionInfo?.webVersion} (Web)`
        : `v${versionInfo?.webVersion}`;

    const versionRowGoesToStore = showUpdateStatus && updateAvailable;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.settings.title')} />
            </div>

            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                <MenuCard title={t('mypage.settings.sections.notification')}>
                    <ListRow
                        title={t('mypage.notificationSettings')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.settings.notifications)}
                    />
                </MenuCard>

                <MenuCard title={t('mypage.settings.sections.app')}>
                    <ListRow
                        title={t('mypage.darkMode')}
                        trailing={<Switch checked={isDarkTheme} onCheckedChange={handleThemeToggle} />}
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
                    {isIconChangeSupported && (
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
                        title={t('mypage.clearCache.title')}
                        trailing={
                            isClearing ? (
                                <IconSpinner className="size-[18px] animate-spin text-description" />
                            ) : (
                                <Chevron />
                            )
                        }
                        onClick={() => void clearLocalCaches()}
                        disabled={isClearing}
                    />
                    <ListRow
                        title={t('mypage.viewOnboarding')}
                        trailing={<Chevron />}
                        onClick={() => {
                            resetOnboarding();
                            navigate(ROUTES.root, { replace: true });
                        }}
                    />
                    <ListRow
                        title={t('mypage.lab.title')}
                        subtitle={t('mypage.lab.settingsHint')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.settings.lab)}
                    />
                </MenuCard>

                <MenuCard title={t('mypage.settings.sections.support')}>
                    <ListRow
                        title={t('mypage.feedback')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.feedback)}
                    />
                    <ListRow
                        title={t('mypage.policy.title')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.policy.root)}
                    />
                </MenuCard>

                <MenuCard>
                    <ListRow
                        title={t('mypage.appVersion')}
                        trailing={
                            <span className="flex items-center gap-1">
                                <span className="text-[14px] text-description">{versionText}</span>
                                {showUpdateStatus && (
                                    <>
                                        <span className="text-[14px] text-description">·</span>
                                        <span
                                            className={
                                                updateAvailable
                                                    ? 'text-[14px] font-medium text-primary'
                                                    : 'text-[14px] text-description'
                                            }
                                        >
                                            {updateAvailable ? t('mypage.updateAvailable') : t('mypage.upToDate')}
                                        </span>
                                    </>
                                )}
                                <IconChevronRight
                                    className={`size-[18px] ${versionRowGoesToStore ? 'text-primary' : 'text-description'}`}
                                />
                            </span>
                        }
                        onClick={versionRowGoesToStore ? handleOpenStore : undefined}
                    />
                </MenuCard>

                {!isGuest && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.logout')}
                            destructive
                            onClick={() => {
                                haptics.play('warning');
                                setIsLogoutDialogOpen(true);
                            }}
                        />
                    </MenuCard>
                )}
            </div>

            <PairingLogoutDialog logout={pairingLogout} action="logout" />
            <LogoutDialog
                isOpen={isLogoutDialogOpen}
                onClose={() => setIsLogoutDialogOpen(false)}
                onConfirm={handleLogout}
            />

            <LanguageSelectSheet isOpen={isLanguageSheetOpen} onClose={() => setIsLanguageSheetOpen(false)} />

            <AppIconSelectSheet
                isOpen={isAppIconSheetOpen}
                onClose={() => setIsAppIconSheetOpen(false)}
                currentIcon={currentIcon}
                availableIcons={availableIcons}
                onSelectIcon={selectIcon}
            />
            <SafeAreaBottomSpacer />
        </div>
    );
};
