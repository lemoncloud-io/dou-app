import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { useInviteLogin } from '../hooks/useInviteLogin';

export const InviteLoginPage = () => {
    const { t } = useTranslation();
    const { login, isSubmitting, isError } = useInviteLogin();
    const [code, setCode] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        void login(code);
    };

    return (
        <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
            {/* ambient brand glow — keeps the empty login screen from feeling sterile */}
            <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    background:
                        'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%), radial-gradient(40% 40% at 80% 100%, hsl(var(--primary) / 0.08), transparent 70%)',
                }}
                aria-hidden
            />
            <form
                onSubmit={handleSubmit}
                className="relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5"
            >
                <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                        C
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-bold tracking-tight text-foreground">{t('auth.invite.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('auth.invite.subtitle')}</p>
                    </div>
                </div>

                <label htmlFor="invite-code" className="sr-only">
                    {t('auth.invite.placeholder')}
                </label>
                <input
                    id="invite-code"
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder={t('auth.invite.placeholder')}
                    aria-label={t('auth.invite.placeholder')}
                    disabled={isSubmitting}
                    className={cn(
                        'h-11 rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors',
                        'border-input focus:border-focus-border disabled:opacity-50'
                    )}
                />
                {isError && <p className="-mt-2 text-sm text-destructive">{t('auth.invite.failed')}</p>}
                <button
                    type="submit"
                    disabled={isSubmitting || !code.trim()}
                    className={cn(
                        'h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                        'hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
                    )}
                >
                    {isSubmitting ? t('auth.invite.preparing') : t('auth.invite.submit')}
                </button>
            </form>
        </div>
    );
};
