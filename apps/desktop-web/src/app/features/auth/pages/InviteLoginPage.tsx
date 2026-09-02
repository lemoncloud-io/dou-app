import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { useSessionAuth } from '@chatic/app-runtime';

import { AuthCard } from '../components';
import { useInviteLogin } from '../hooks/useInviteLogin';
import { inviteLoginErrorText } from '../utils';

export const InviteLoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated } = useSessionAuth();
    const { login, isSubmitting, error } = useInviteLogin();
    const [code, setCode] = useState('');

    // Authenticated (in-app /join) → back to chat; unauthenticated (/auth/login)
    // → back to the welcome landing. Explicit targets stay correct even with no
    // history (refresh / deep link), unlike navigate(-1).
    const handleBack = () => navigate(isAuthenticated ? '/' : '/auth/welcome');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        // Navigate home on success so the in-app /join path advances; the
        // unauthenticated path also lands here harmlessly after the auth flip.
        void login(code).then(ok => {
            if (ok) navigate('/');
        });
    };

    return (
        <AuthCard title={t('auth.invite.title')} subtitle={t('auth.invite.subtitle')} onBack={handleBack}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                {error && <p className="-mt-2 text-sm text-destructive">{inviteLoginErrorText(error, t)}</p>}
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
                {import.meta.env.DEV && (
                    <button
                        type="button"
                        onClick={() => navigate('/auth/debug')}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        {t('auth.debug.link')}
                    </button>
                )}
            </form>
        </AuthCard>
    );
};
