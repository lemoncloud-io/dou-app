import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';

import {
    PageShell,
    SettingsNavRow,
    SettingsRowGroup,
    SettingsSwitchRow,
    formatHourMinute,
    parseHourMinute,
    useNotificationPrefsStore,
    VersionInfo,
} from '../../../shared';
import { NotificationSnoozeButton } from '../../chat/components/NotificationSnoozeButton';
import { canApprovePairing } from '../../pairing/utils/devicePairing';
import { useOnboardingStore, useShortcutsDialogStore } from '../../chat/stores';
import { MiniAppSettingsItem, ReportIssueDialog } from '../components';
import { useDevicePushMute } from '../hooks';
import { LaunchAtLoginSection } from './LaunchAtLoginSection';
import { QuietHoursMentionSection } from './QuietHoursMentionSection';

/**
 * Length of a quiet window that may cross midnight (22:00–07:00 is 9h), or null
 * when it is empty or unreadable — start equal to end silences nothing.
 */
const quietWindowMinutes = (start: string, end: string): number | null => {
    const s = parseHourMinute(start);
    const e = parseHourMinute(end);
    if (s == null || e == null || s === e) return null;
    return (e - s + 24 * 60) % (24 * 60);
};

export const SettingsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const pushMute = useDevicePushMute();
    const reopenOnboarding = useOnboardingStore(s => s.reopen);
    const openShortcuts = useShortcutsDialogStore(s => s.setOpen);
    const [reportOpen, setReportOpen] = useState(false);
    const isPairedSession = runtime.session.useIsPairedSession();
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
                    {/* Beside the account: approving a browser lends it this account. The browser's code
                        screen names this place ("Settings › Approve web sign-in"), so it stays here. */}
                    {canApprovePairing(isPairedSession) && (
                        <SettingsNavRow
                            label={t('pairing.approve.entry')}
                            hint={t('pairing.approve.entryHint')}
                            onClick={() => navigate('/settings/pairing/approve', { state: { from: '/settings' } })}
                        />
                    )}
                </SettingsRowGroup>
            </section>

            {/* Desktop shell only — renders nothing in a plain browser. */}
            <LaunchAtLoginSection />

            {/* A shell that opens any https page only, and never in the Default Cloud. */}
            <MiniAppSettingsItem />

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
                            <fieldset className="flex items-center gap-3 pt-2">
                                <legend className="sr-only">{t('settings.quietHoursTimeLegend')}</legend>
                                <label className="flex flex-col gap-1.5 text-caption text-muted-foreground">
                                    {t('settings.quietHoursStart')}
                                    <input
                                        type="time"
                                        value={quietHours.start}
                                        onChange={e => setQuietHours({ start: e.target.value, end: quietHours.end })}
                                        aria-describedby="quiet-hours-window"
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
                            </fieldset>
                        )}
                        {/* The computed window, so an overnight range reads as intended and
                            an empty one (start = end) is caught instead of silently doing nothing.
                            A steady live region, not a toggled alert: both inputs point at it,
                            and it explains the empty window instead of blocking the save. */}
                        {quietHours && (
                            <p
                                id="quiet-hours-window"
                                aria-live="polite"
                                className={cn(
                                    'text-caption',
                                    quietWindow == null ? 'text-destructive' : 'text-muted-foreground'
                                )}
                            >
                                {quietWindow == null
                                    ? t('settings.quietHoursEmpty')
                                    : t('settings.quietHoursWindow', {
                                          start: formatHourMinute(quietHours.start),
                                          end: formatHourMinute(quietHours.end),
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
