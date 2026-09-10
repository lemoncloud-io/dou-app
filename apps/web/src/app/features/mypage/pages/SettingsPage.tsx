import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoreUrl, useNavigateWithTransition } from '@chatic/shared';

import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useDeviceInfo } from '@chatic/device-utils';
import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';
import { runtime } from '@chatic/app-runtime';

import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog } from '../components';
import { useAppIcon } from '../hooks';
import { useOnboarding, useTheme } from '../../../hooks';
import { useAppUpdateStatus } from '../../appUpdate';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

/**
 * Settings depth — everything the MY hub used to stack under the profile. Reached from the hub's
 * gear; not a tab, so the floating nav is absent here (UnifiedLayout matches `/mypage` exactly).
 */
export const SettingsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
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

    const currentLanguageLabel = t(`mypage.language.${i18n.language}`);

    const isMobilePlatform = deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android';
    // iOS only: Android has no live-version source yet (see ADR-0033), so a status label there would
    // be a guess rather than a check. `updateAvailable` is the live bridge check, not
    // versionInfo.shouldUpdate — the latter comes from the boot-time injection and is always false
    // on a cold start (see useAppUpdateStatus).
    const showUpdateStatus = deviceInfo?.platform === 'ios';

    // Logout + local cache teardown is handled by the shared /auth/logout flow (LogoutPage).
    const handleLogout = () => {
        navigate(ROUTES.auth.logout);
    };

    const handleThemeToggle = () => {
        setTheme(isDarkTheme ? 'light' : 'dark');
    };

    const handleOpenStore = () => {
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

    // The version row opens the store only when an update is pending. Debug unlock lives in the
    // dedicated Lab screen so this informational row has no hidden side effect.
    const versionRowGoesToStore = showUpdateStatus && updateAvailable;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            {/* The page itself is the scrollport, so the bar has to stick: left in the flow it
                would scroll away and take the frosted notch strip with it, and the rows passing
                the status bar would pass it unblurred. */}
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.settings.title')} />
            </div>

            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                {/* Notifications — a depth of its own; the toggles live one level down. */}
                <MenuCard title={t('mypage.settings.sections.notification')}>
                    <ListRow
                        title={t('mypage.notificationSettings')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.settings.notifications)}
                    />
                </MenuCard>

                {/* App settings */}
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
                    <ListRow
                        title={t('mypage.lab.title')}
                        subtitle={t('mypage.lab.settingsHint')}
                        trailing={<Chevron />}
                        onClick={() => navigate(ROUTES.mypage.settings.lab)}
                    />
                </MenuCard>

                {/* Support & info */}
                <MenuCard title={t('mypage.settings.sections.support')}>
                    {/* Sole entry point for feedback — reachable by guests too, since `reportIssue`
                        accepts an unauthenticated session (ADR-0047). */}
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

                {/* Version */}
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

                {/* Logout */}
                {!isGuest && (
                    <MenuCard>
                        <ListRow title={t('mypage.logout')} destructive onClick={() => setIsLogoutDialogOpen(true)} />
                    </MenuCard>
                )}
            </div>

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
        </div>
    );
};
