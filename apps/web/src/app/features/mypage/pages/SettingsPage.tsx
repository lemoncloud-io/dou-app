import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoreUrl, useNavigateWithTransition } from '@chatic/shared';

import { isNative } from '@chatic/bridges';
import { appBridge } from '../../../bridge';
import { useDeviceInfo } from '@chatic/device-utils';
import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { AppIconSelectSheet, LanguageSelectSheet, LogoutDialog } from '../components';
import { useAppIcon } from '../hooks';
import { useTheme } from '../../../hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { DebugUnlockDialog, debugOverlayActions, useDebugMode, useDebugUnlock } from '../../debug';
import { useAppUpdateStatus } from '../../appUpdate';
import { PageHeader } from '../../../ui/components';
import { ROUTES } from '../../../routes/paths';

// See MyPage for why the import.meta.env read lives in a page rather than in the debug hooks.
const DEBUG_CODE = import.meta.env.VITE_DEBUG_CODE;

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

/**
 * Settings depth — everything the MY hub used to stack under the profile. Reached from the hub's
 * gear; not a tab, so the floating nav is absent here (UnifiedLayout matches `/mypage` exactly).
 */
export const SettingsPage = () => {
    const navigate = useNavigateWithTransition();
    const { t, i18n } = useTranslation();
    const { isGuest } = useRuntimeProfile();

    const { setTheme, isDarkTheme } = useTheme();
    const { deviceInfo, versionInfo } = useDeviceInfo();
    const { resetOnboarding } = usePreferenceStore();
    const { isEnabled: isDebugMode } = useDebugMode();
    const { isChallengeOpen, hasError, registerTap, submitCode, cancelChallenge } = useDebugUnlock(DEBUG_CODE);
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

    // One version row (the design merged the old version + store rows), so its tap has to serve two
    // masters: the hidden debug unlock and the store link. They cannot share a tap — the first tap
    // would navigate away and the 10-tap gate could never complete — so the row routes to the store
    // only while an update is actually pending, and otherwise keeps the unlock gate. That leaves the
    // gate reachable in the ordinary (up-to-date) state on every platform.
    const versionRowGoesToStore = showUpdateStatus && updateAvailable;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pt-safe-top">
            <PageHeader title={t('mypage.settings.title')} />

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

                {/* Version (+ the debug entry once unlocked) */}
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
                        onClick={versionRowGoesToStore ? handleOpenStore : registerTap}
                    />
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

            {/* Debug Unlock Dialog — opens after the hidden 10-tap on the app version row */}
            <DebugUnlockDialog
                isOpen={isChallengeOpen}
                hasError={hasError}
                onSubmit={submitCode}
                onCancel={cancelChallenge}
            />
        </div>
    );
};
