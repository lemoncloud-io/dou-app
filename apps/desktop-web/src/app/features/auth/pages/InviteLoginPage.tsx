import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { runtime } from '@chatic/app-runtime';

import { AuthCard } from '../components';
import { useInviteLogin } from '../hooks/useInviteLogin';
import { inviteLoginErrorText } from '../utils';

export const InviteLoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { login, isSubmitting, error } = useInviteLogin();
    const [code, setCode] = useState('');

    // Authenticated (in-app /join) → back to chat; unauthenticated (/auth/login)
    // → back to the welcome landing. Explicit targets stay correct even with no
    // history (refresh / deep link), unlike navigate(-1).
    const handleBack = () => navigate(isAuthenticated ? '/' : '/auth/welcome');

    // Set once login resolves; the navigate waits for the session to actually
    // flip. Navigating on the promise alone raced the flip, and the router's
    // unauthenticated catch-all then bounced a successful login back to Welcome.
    const [loggedIn, setLoggedIn] = useState(false);
    useEffect(() => {
        if (loggedIn && isAuthenticated) navigate('/');
    }, [loggedIn, isAuthenticated, navigate]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        void login(code).then(ok => {
            if (ok) setLoggedIn(true);
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
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'invite-code-error' : undefined}
                    className={cn(
                        'focus-ring h-11 rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors',
                        'border-input focus:border-focus-border disabled:opacity-50'
                    )}
                />
                {/* role="alert" so a rejected code is announced, not just drawn. */}
                {error && (
                    <p id="invite-code-error" role="alert" className="-mt-2 text-sm text-destructive">
                        {inviteLoginErrorText(error, t)}
                    </p>
                )}
                <Button type="submit" size="lg" disabled={isSubmitting || !code.trim()}>
                    {isSubmitting ? t('auth.invite.preparing') : t('auth.invite.submit')}
                </Button>
                {import.meta.env.DEV && (
                    <Button variant="link" size="sm" onClick={() => navigate('/auth/debug')}>
                        {t('auth.debug.link')}
                    </Button>
                )}
            </form>
        </AuthCard>
    );
};
