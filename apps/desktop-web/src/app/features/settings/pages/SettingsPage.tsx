import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { type Theme, useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { useNotificationPrefsStore, VersionInfo } from '../../../shared';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];
const LANGUAGE_OPTIONS = ['en'] as const;

/** Mini preview swatch for each theme choice. */
const THEME_SWATCH: Record<Theme, string> = {
    light: 'border-zinc-300 bg-white',
    dark: 'border-zinc-700 bg-zinc-900',
    system: 'border-zinc-400 bg-gradient-to-r from-white to-zinc-900',
};

export const SettingsPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const desktopEnabled = useNotificationPrefsStore(s => s.desktopEnabled);
    const setDesktopEnabled = useNotificationPrefsStore(s => s.setDesktopEnabled);
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const setQuietHours = useNotificationPrefsStore(s => s.setQuietHours);

    const quietEnabled = quietHours != null;
    const toggleQuiet = (on: boolean) => setQuietHours(on ? (quietHours ?? { start: '22:00', end: '07:00' }) : null);

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/')}>
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('settings.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <section className="flex flex-col gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('settings.appearance')}
                    </h2>

                    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5">
                        <div className="flex flex-col gap-2.5">
                            <span className="text-sm font-medium text-foreground">{t('settings.theme')}</span>
                            <div className="flex gap-2">
                                {THEME_OPTIONS.map(option => (
                                    <button
                                        key={option}
                                        onClick={() => setTheme(option)}
                                        className={cn(
                                            'focus-ring flex flex-1 flex-col items-center gap-2 rounded-lg border p-3 text-sm capitalize transition-all active:scale-[0.98]',
                                            theme === option
                                                ? 'border-primary bg-primary/10 font-semibold text-foreground'
                                                : 'border-input text-muted-foreground hover:border-border hover:bg-accent'
                                        )}
                                    >
                                        <span className={cn('h-6 w-10 rounded-md border', THEME_SWATCH[option])} />
                                        {t(`settings.theme.${option}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2.5">
                            <span className="text-sm font-medium text-foreground">{t('settings.language')}</span>
                            <div className="flex gap-2">
                                {LANGUAGE_OPTIONS.map(lng => (
                                    <button
                                        key={lng}
                                        onClick={() => void i18n.changeLanguage(lng)}
                                        className={cn(
                                            'focus-ring rounded-lg border px-4 py-2 text-sm uppercase transition-all active:scale-[0.98]',
                                            i18n.language === lng
                                                ? 'border-primary bg-primary/10 font-semibold text-foreground'
                                                : 'border-input text-muted-foreground hover:border-border hover:bg-accent'
                                        )}
                                    >
                                        {lng}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-8 flex flex-col gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('settings.notifications')}
                    </h2>

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium text-foreground">
                                {t('settings.desktopNotifications')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {t('settings.desktopNotificationsHint')}
                            </span>
                        </div>
                        <Switch
                            checked={desktopEnabled}
                            onCheckedChange={setDesktopEnabled}
                            aria-label={t('settings.desktopNotifications')}
                        />
                    </div>

                    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-medium text-foreground">{t('settings.quietHours')}</span>
                                <span className="text-xs text-muted-foreground">{t('settings.quietHoursHint')}</span>
                            </div>
                            <Switch
                                checked={quietEnabled}
                                onCheckedChange={toggleQuiet}
                                aria-label={t('settings.quietHours')}
                            />
                        </div>
                        {quietHours && (
                            <div className="flex items-center gap-3">
                                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                                    {t('settings.quietHoursStart')}
                                    <input
                                        type="time"
                                        value={quietHours.start}
                                        onChange={e => setQuietHours({ start: e.target.value, end: quietHours.end })}
                                        className="focus-ring rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                </label>
                                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                                    {t('settings.quietHoursEnd')}
                                    <input
                                        type="time"
                                        value={quietHours.end}
                                        onChange={e => setQuietHours({ start: quietHours.start, end: e.target.value })}
                                        className="focus-ring rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </section>

                <section className="mt-8 flex flex-col gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('settings.about')}
                    </h2>

                    <div className="rounded-xl border border-border bg-card p-5">
                        <VersionInfo />
                    </div>
                </section>
            </div>
        </div>
    );
};
