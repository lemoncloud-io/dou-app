import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { type Theme, useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';

import {
    PageShell,
    SettingsNavRow,
    SettingsRowGroup,
    SettingsSwitchRow,
    radioGroupOptions,
    useNotificationPrefsStore,
    VersionInfo,
} from '../../../shared';
import { NotificationSnoozeButton } from '../../chat/components/NotificationSnoozeButton';
import { useOnboardingStore, useShortcutsDialogStore } from '../../chat/stores';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, setLanguage } from '../../../../i18n';
import { ReportIssueDialog } from '../components';
import { useDevicePushMute } from '../hooks';
import { LaunchAtLoginSection } from './LaunchAtLoginSection';
import { QuietHoursMentionSection } from './QuietHoursMentionSection';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];

/** "HH:MM" → minutes past midnight, or null when the input is incomplete. */
const toMinutes = (value: string): number | null => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Length of a quiet window that may cross midnight (22:00–07:00 is 9h), or null
 * when it is empty or unreadable — start equal to end silences nothing.
 */
const quietWindowMinutes = (start: string, end: string): number | null => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s == null || e == null || s === e) return null;
    return (e - s + 24 * 60) % (24 * 60);
};
// The bundles that actually ship (src/i18n.ts owns the list). A picker with a
// single choice is chrome, so it stays hidden until there is a second language.
const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES;

/**
 * Mini preview swatch for each theme choice. The two solid halves of the system
 * swatch are the light and dark grounds side by side — not a gradient blend,
 * which would read as a third theme that does not exist.
 */
const THEME_SWATCH: Record<Theme, string> = {
    light: 'border-swatch-border bg-swatch-light',
    dark: 'border-swatch-border bg-swatch-dark',
    system: 'border-swatch-border bg-swatch-light',
};

export const SettingsPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const themeProps = radioGroupOptions(THEME_OPTIONS, theme, setTheme);
    const languageProps = radioGroupOptions(LANGUAGE_OPTIONS, i18n.language, setLanguage);
    const pushMute = useDevicePushMute();
    const reopenOnboarding = useOnboardingStore(s => s.reopen);
    const openShortcuts = useShortcutsDialogStore(s => s.setOpen);
    const [reportOpen, setReportOpen] = useState(false);
    const desktopEnabled = useNotificationPrefsStore(s => s.desktopEnabled);
    const setDesktopEnabled = useNotificationPrefsStore(s => s.setDesktopEnabled);
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const setQuietHours = useNotificationPrefsStore(s => s.setQuietHours);

    const quietEnabled = quietHours != null;
    const quietWindow = quietHours ? quietWindowMinutes(quietHours.start, quietHours.end) : null;
    const toggleQuiet = (on: boolean) => setQuietHours(on ? (quietHours ?? { start: '22:00', end: '07:00' }) : null);

    return (
        <PageShell
            title={t('settings.title')}
            backTo="/"
            backLabel={t('cloud.home')}
            actions={
                // Every control here writes as it changes. Saying so once is what
                // stops a person hunting for a Save button that does not exist.
                <span className="text-caption text-muted-foreground">{t('settings.autosave')}</span>
            }
        >
            <section className="flex flex-col gap-4">
                <SettingsRowGroup>
                    <SettingsNavRow
                        label={t('account.title')}
                        hint={t('account.openHint')}
                        onClick={() => navigate('/account')}
                    />
                </SettingsRowGroup>
            </section>

            <section className="mt-8 flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('settings.appearance')}</h2>

                <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-2.5">
                        <span id="settings-theme-label" className="text-callout font-medium text-foreground">
                            {t('settings.theme')}
                        </span>
                        <div role="radiogroup" aria-labelledby="settings-theme-label" className="flex gap-2">
                            {THEME_OPTIONS.map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    {...themeProps(option)}
                                    className={cn(
                                        'focus-ring tactile flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 text-callout capitalize transition-colors ease-tactile',
                                        theme === option
                                            ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
                                            : 'border-control-border text-muted-foreground hover:bg-accent'
                                    )}
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'flex h-6 w-10 overflow-hidden rounded-md border',
                                            THEME_SWATCH[option]
                                        )}
                                    >
                                        {/* "System" is both grounds at once: two solid halves, no blend. */}
                                        {option === 'system' && <span className="h-full w-1/2 bg-swatch-dark" />}
                                    </span>
                                    {t(`settings.theme.${option}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Hidden while a single bundle ships — see LANGUAGE_OPTIONS. The
                            choice is remembered, and with none stored the app follows the
                            system language. */}
                    {LANGUAGE_OPTIONS.length > 1 && (
                        <div className="flex flex-col gap-2.5">
                            <span id="settings-language-label" className="text-callout font-medium text-foreground">
                                {t('settings.language')}
                            </span>
                            <div role="radiogroup" aria-labelledby="settings-language-label" className="flex gap-2">
                                {LANGUAGE_OPTIONS.map(lng => (
                                    <button
                                        key={lng}
                                        type="button"
                                        {...languageProps(lng)}
                                        className={cn(
                                            'focus-ring tactile rounded-lg border px-4 py-2 text-callout transition-colors ease-tactile',
                                            i18n.language === lng
                                                ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
                                                : 'border-control-border text-muted-foreground hover:bg-accent'
                                        )}
                                    >
                                        {LANGUAGE_LABELS[lng]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Desktop shell only — renders nothing in a plain browser. */}
            <LaunchAtLoginSection />

            <section className="mt-8 flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('settings.notifications')}</h2>
                <p className="text-caption text-muted-foreground">{t('settings.notificationsHint')}</p>

                <SettingsRowGroup>
                    <SettingsSwitchRow
                        label={t('settings.desktopNotifications')}
                        hint={t('settings.desktopNotificationsHint')}
                        checked={desktopEnabled}
                        onCheckedChange={setDesktopEnabled}
                    />

                    {/* A different axis from the switch above: that one stops this app from
                        raising a banner, this one stops the server from sending the device
                        anything — including while the app is closed. */}
                    <SettingsSwitchRow
                        label={t('settings.devicePush')}
                        hint={t(pushMute.isSupported ? 'settings.devicePushHint' : 'settings.devicePushShellOnly')}
                        hintId="device-push-hint"
                        describedBy={pushMute.hasFailed ? 'device-push-error' : 'device-push-hint'}
                        checked={pushMute.isSupported && pushMute.pushEnabled}
                        onCheckedChange={pushMute.setPushEnabled}
                        disabled={!pushMute.isSupported || pushMute.isPending}
                    >
                        {/* Off wherever it cannot apply: a disabled switch showing "on"
                            claimed a push this browser was never going to receive. The
                            reason it is off — or disabled — is read with it. */}
                        {pushMute.hasFailed && (
                            <span id="device-push-error" className="text-caption text-destructive">
                                {t('settings.devicePushFailed')}
                            </span>
                        )}
                    </SettingsSwitchRow>

                    <SettingsSwitchRow
                        label={t('settings.quietHours')}
                        hint={t('settings.quietHoursHint')}
                        checked={quietEnabled}
                        onCheckedChange={toggleQuiet}
                    >
                        {quietHours && (
                            <div className="flex items-center gap-3 pt-2">
                                <label className="flex flex-col gap-1.5 text-caption text-muted-foreground">
                                    {t('settings.quietHoursStart')}
                                    <input
                                        type="time"
                                        value={quietHours.start}
                                        onChange={e => setQuietHours({ start: e.target.value, end: quietHours.end })}
                                        className="focus-ring rounded-lg border border-control-border bg-background px-3 py-2 text-callout text-foreground"
                                    />
                                </label>
                                <label className="flex flex-col gap-1.5 text-caption text-muted-foreground">
                                    {t('settings.quietHoursEnd')}
                                    <input
                                        type="time"
                                        value={quietHours.end}
                                        onChange={e => setQuietHours({ start: quietHours.start, end: e.target.value })}
                                        aria-invalid={quietWindow == null ? true : undefined}
                                        aria-describedby="quiet-hours-window"
                                        className="focus-ring rounded-lg border border-control-border bg-background px-3 py-2 text-callout text-foreground"
                                    />
                                </label>
                            </div>
                        )}
                        {/* The computed window, so an overnight range reads as intended and
                            an empty one (start = end) is caught instead of silently doing nothing. */}
                        {quietHours && (
                            <p
                                id="quiet-hours-window"
                                role={quietWindow == null ? 'alert' : undefined}
                                className={cn(
                                    'text-caption',
                                    quietWindow == null ? 'text-destructive' : 'text-muted-foreground'
                                )}
                            >
                                {quietWindow == null
                                    ? t('settings.quietHoursEmpty')
                                    : t('settings.quietHoursWindow', {
                                          start: quietHours.start,
                                          end: quietHours.end,
                                          hours: Math.floor(quietWindow / 60),
                                          minutes: quietWindow % 60,
                                      })}
                            </p>
                        )}
                        <QuietHoursMentionSection />
                    </SettingsSwitchRow>
                </SettingsRowGroup>

                {/* The sidebar owned the only snooze control; the section that owns
                    muting surfaces it too. Self-contained: store-driven, no props. */}
                <div className="rounded-xl border border-border bg-card p-2">
                    <NotificationSnoozeButton />
                </div>
            </section>

            <section className="mt-8 flex flex-col gap-4">
                <h2 className="text-overline uppercase text-muted-foreground">{t('settings.about')}</h2>

                <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5">
                    <VersionInfo />
                    <div className="flex flex-wrap gap-2">
                        {/* The only way back to the welcome tips once they were dismissed. */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                reopenOnboarding();
                                navigate('/');
                            }}
                        >
                            {t('settings.showTips')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openShortcuts(true)}>
                            {t('shortcuts.title')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
                            {t('settings.report.action')}
                        </Button>
                    </div>
                </div>
            </section>
            <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} />
        </PageShell>
    );
};
