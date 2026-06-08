import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { useGuestLogin } from '../hooks/useGuestLogin';

/**
 * First-run landing. Offers a one-tap guest start (device-register into the
 * Default Cloud's Self Channel) plus a secondary path for users who hold an
 * Invite Code. Replaces the invite-only gate as the default unauthenticated screen.
 */
export const WelcomePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { submit, isSubmitting, isError } = useGuestLogin();

    return (
        <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
            {/* ambient brand glow — keeps the empty screen from feeling sterile */}
            <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    background:
                        'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%), radial-gradient(40% 40% at 80% 100%, hsl(var(--primary) / 0.08), transparent 70%)',
                }}
                aria-hidden
            />
            <div className="relative flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5">
                <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                        C
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-bold tracking-tight text-foreground">{t('welcome.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('welcome.subtitle')}</p>
                    </div>
                </div>

                {isError && <p className="text-sm text-destructive">{t('welcome.registerFailed')}</p>}

                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={isSubmitting}
                        className={cn(
                            'h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                            'hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
                        )}
                    >
                        {isSubmitting ? t('welcome.starting') : isError ? t('welcome.retry') : t('welcome.start')}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/auth/login')}
                        disabled={isSubmitting}
                        className="h-11 rounded-full border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                        {t('welcome.haveInvite')}
                    </button>
                </div>
            </div>
        </div>
    );
};
