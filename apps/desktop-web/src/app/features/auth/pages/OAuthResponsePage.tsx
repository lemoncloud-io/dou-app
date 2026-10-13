import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { AuthCard } from '../components';
import { useSocialLogin } from '../hooks';
import { buildAppDeeplink, buildOAuthDeeplink } from '../utils';

/**
 * OAuth Relay hand-off page. The relay redirects here with `?code=&provider=` after the provider
 * consent screen, and with the `nonce` the app put on the `redirect` address when it started the
 * login. A return that has no nonce is not one this app asked for, so the page stops with the
 * failure screen instead of opening the app.
 *
 * - Inside the Desktop Shell (capability-detected): exchange the code directly —
 *   covers the degenerate case where the relay return landed in the app window.
 * - In a plain browser (the normal system-browser flow): forward the code and the nonce into
 *   the app via the `chatic://oauth` deeplink, with a manual button as fallback
 *   for when the auto-jump is blocked.
 */
export const OAuthResponsePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { completeFromHandoff, isError } = useSocialLogin();
    const ranRef = useRef(false);
    const [deeplink, setDeeplink] = useState<string | null>(null);

    const code = params.get('code') ?? '';
    const provider = params.get('provider') || 'google';
    const nonce = params.get('nonce') ?? '';
    const isComplete = code.length > 0 && nonce.length > 0;

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;
        if (!isComplete) return;

        if (isNative()) {
            // Pre-auth: success flips isAuthenticated → router leaves this branch.
            // In-app (already signed in): the exchange swaps the session and reloads.
            // A link leaves the session as it was, so nothing moves the page: go back to the account hub.
            void completeFromHandoff({ provider, code, nonce }).then(done => {
                if (done === 'link') navigate('/account', { replace: true });
            });
            return;
        }
        const url = buildOAuthDeeplink(provider, code, nonce);
        setDeeplink(url);
        window.location.replace(url);
    }, [isComplete, provider, code, nonce, completeFromHandoff, navigate]);

    const failed = !isComplete || isError;
    const inApp = isNative();

    return (
        <AuthCard
            live
            title={failed ? t('auth.social.failedTitle') : t('auth.social.handoffTitle')}
            subtitle={
                failed
                    ? t(inApp ? 'auth.social.failed' : 'auth.social.failedInBrowser')
                    : deeplink
                      ? t('auth.social.handoffBody')
                      : t('auth.social.signingIn')
            }
        >
            <div className="flex flex-col gap-2">
                {failed ? (
                    inApp ? (
                        <Button size="lg" onClick={() => navigate('/auth/welcome', { replace: true })}>
                            {t('auth.social.backToWelcome')}
                        </Button>
                    ) : (
                        // In the system browser a way "back" would open a second copy of the app in this
                        // tab. The retry is in the DoU window, so the page points there and opens it.
                        <Button size="lg" asChild>
                            <a href={buildAppDeeplink()}>{t('auth.social.openApp')}</a>
                        </Button>
                    )
                ) : (
                    deeplink && (
                        <>
                            <Button size="lg" asChild>
                                <a href={deeplink}>{t('auth.social.openApp')}</a>
                            </Button>
                            <p className="break-keep text-center text-caption text-muted-foreground">
                                {t('auth.social.closeTab')}
                            </p>
                        </>
                    )
                )}
            </div>
        </AuthCard>
    );
};
