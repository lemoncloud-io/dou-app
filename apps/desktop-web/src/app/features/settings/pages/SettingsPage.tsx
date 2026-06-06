import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { type Theme, useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';

const THEME_OPTIONS: Theme[] = ['light', 'dark', 'system'];
const LANGUAGE_OPTIONS = ['en'] as const;

export const SettingsPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    {t('settings.back')}
                </Button>
                <h1 className="text-base font-semibold text-foreground">{t('settings.title')}</h1>
            </header>

            <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <section className="flex flex-col gap-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('settings.appearance')}
                    </h2>

                    <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">{t('settings.theme')}</span>
                        <div className="flex gap-2">
                            {THEME_OPTIONS.map(option => (
                                <button
                                    key={option}
                                    onClick={() => setTheme(option)}
                                    className={cn(
                                        'flex-1 rounded-md border px-4 py-2 text-sm capitalize',
                                        theme === option
                                            ? 'border-primary bg-primary/10 font-semibold text-foreground'
                                            : 'border-input text-muted-foreground hover:bg-accent/50'
                                    )}
                                >
                                    {t(`settings.theme.${option}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-foreground">{t('settings.language')}</span>
                        <div className="flex gap-2">
                            {LANGUAGE_OPTIONS.map(lng => (
                                <button
                                    key={lng}
                                    onClick={() => void i18n.changeLanguage(lng)}
                                    className={cn(
                                        'rounded-md border px-4 py-2 text-sm uppercase',
                                        i18n.language === lng
                                            ? 'border-primary bg-primary/10 font-semibold text-foreground'
                                            : 'border-input text-muted-foreground hover:bg-accent/50'
                                    )}
                                >
                                    {lng}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
