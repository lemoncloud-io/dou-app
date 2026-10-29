import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { runtime } from '@chatic/app-runtime';

import { AuthCard } from '../components';
import { useInviteLogin } from '../hooks/useInviteLogin';
import { useSignOutGuest } from '../hooks/useSignOutGuest';
import { useInviteLoginPageStore } from '../stores';
import { inviteLoginErrorText } from '../utils';

export const InviteLoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { preview: lookUp, enter } = useInviteLogin();
    const signOutGuest = useSignOutGuest();
    // Page state lives in a store: the guest session the preview makes flips the router to its
    // signed-in branch, which can remount this page before the lookup or the exchange settles.
    const {
        code,
        step,
        preview,
        createdGuest,
        isSubmitting,
        error,
        done,
        setCode,
        start,
        resolvePreview,
        beginEnter,
        finish,
        backToPaste,
        release,
    } = useInviteLoginPageStore();

    // Authenticated (in-app /join) → back to chat; unauthenticated (/auth/login)
    // → back to the welcome landing. Explicit targets stay correct even with no
    // history (refresh / deep link), unlike navigate(-1).
    const leave = () => {
        release();
        // A guest this page registered is signed out (which reloads to Welcome); a session that was
        // there before the page opened is not ours to end.
        if (createdGuest) {
            void signOutGuest();
            return;
        }
        navigate(isAuthenticated ? '/' : '/auth/welcome');
    };

    // `done` is set once login resolves; the navigate waits for the session to actually
    // flip. Navigating on the promise alone raced the flip, and the router's
    // unauthenticated catch-all then bounced a successful login back to Welcome.
    useEffect(() => {
        if (!done || !isAuthenticated) return;
        release();
        navigate('/');
    }, [done, isAuthenticated, release, navigate]);

    const handlePaste = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        const attempt = start();
        void lookUp(code).then(result => resolvePreview(attempt, result));
    };

    const handleJoin = () => {
        if (isSubmitting || !preview) return;
        beginEnter();
        void enter(preview).then(finish);
    };

    const errorBlock = error && (
        <div id="invite-code-error" role="alert" className="flex flex-col gap-1">
            <p className="text-callout text-destructive">{inviteLoginErrorText(error, t)}</p>
            {error.kind === 'server' && error.message && (
                <p className="break-all font-mono text-caption text-muted-foreground">{error.message}</p>
            )}
        </div>
    );

    if (step === 'paste') {
        // No way out while the lookup runs: it is registering the device guest, and leaving now
        // would release the hold before that guest is known, so nothing could sign it out.
        // It is seconds long and ends on its own.
        return (
            <AuthCard
                title={t('auth.invite.title')}
                subtitle={t('auth.invite.subtitle')}
                onBack={isSubmitting ? undefined : leave}
            >
                <form onSubmit={handlePaste} className="flex flex-col gap-5">
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
                            'focus-ring h-11 rounded-lg border bg-background px-3 text-callout text-foreground outline-none transition-colors',
                            'border-control-border focus:border-focus-border disabled:opacity-50'
                        )}
                    />
                    {/* role="alert" so a rejected code is announced, not just drawn. */}
                    {errorBlock}
                    <Button type="submit" size="lg" disabled={isSubmitting || !code.trim()}>
                        {isSubmitting ? t('auth.invite.checking') : t('auth.invite.continue')}
                    </Button>
                    {import.meta.env.DEV && (
                        <Button variant="link" size="sm" onClick={() => navigate('/auth/debug')}>
                            {t('auth.debug.link')}
                        </Button>
                    )}
                </form>
            </AuthCard>
        );
    }

    return (
        <AuthCard
            title={t('auth.invite.preview.title')}
            subtitle={t('auth.invite.preview.subtitle')}
            onBack={step === 'preview' ? backToPaste : undefined}
        >
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3">
                    {preview?.placeName ? (
                        <>
                            <p className="text-headline font-semibold text-foreground">{preview.placeName}</p>
                            {preview.inviterName && (
                                <p className="text-callout text-muted-foreground">
                                    {t('auth.invite.preview.invitedBy', { name: preview.inviterName })}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-callout text-muted-foreground">{t('auth.invite.preview.noDetails')}</p>
                    )}
                </div>
                {errorBlock}
                <Button size="lg" onClick={handleJoin} disabled={isSubmitting}>
                    {step === 'entering' ? t('auth.invite.preview.joining') : t('auth.invite.preview.join')}
                </Button>
            </div>
        </AuthCard>
    );
};
