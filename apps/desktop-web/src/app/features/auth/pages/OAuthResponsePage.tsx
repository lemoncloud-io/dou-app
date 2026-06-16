import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { cn } from '@chatic/lib/utils';

import { AuthCard } from '../components';
import { useSocialLogin } from '../hooks';
import { buildOAuthDeeplink } from '../utils';

/**
 * OAuth Relay hand-off page (ADR 0009). The relay redirects here with
 * `?code=&provider=` after the provider consent screen.
 *
 * - Inside the Desktop Shell (capability-detected): exchange the code directly —
 *   covers the degenerate case where the relay return landed in the app window.
 * - In a plain browser (the normal system-browser flow): forward the code into
 *   the app via the `chatic://oauth` deeplink, with a manual button as fallback
 *   for when the auto-jump is blocked.
 */
export const OAuthResponsePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { complete, isError } = useSocialLogin();
    const ranRef = useRef(false);
    const [deeplink, setDeeplink] = useState<string | null>(null);

    const code = params.get('code') ?? '';
    const provider = params.get('provider') || 'google';
    const hasCode = code.length > 0;

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;
        if (!hasCode) return;

        if (isNative()) {
            // Pre-auth: success flips isAuthenticated → router leaves this branch.
            // In-app (already signed in): complete() swaps the session and reloads.
            void complete(provider, code);
            return;
        }
        const url = buildOAuthDeeplink(provider, code);
        setDeeplink(url);
        window.location.replace(url);
    }, [hasCode, provider, code, complete]);

    const failed = !hasCode || isError;

    return (
        <AuthCard
            title={failed ? t('auth.social.failedTitle') : t('auth.social.handoffTitle')}
            subtitle={
                failed ? t('auth.social.failed') : deeplink ? t('auth.social.handoffBody') : t('auth.social.signingIn')
            }
        >
            <div className="flex flex-col gap-2">
                {failed ? (
                    <button
                        type="button"
                        onClick={() => navigate('/auth/welcome', { replace: true })}
                        className={cn(
                            'h-11 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                            'hover:opacity-90 active:scale-[0.98]'
                        )}
                    >
                        {t('auth.social.backToWelcome')}
                    </button>
                ) : (
                    deeplink && (
                        <>
                            <a
                                href={deeplink}
                                className={cn(
                                    'flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-all',
                                    'hover:opacity-90 active:scale-[0.98]'
                                )}
                            >
                                {t('auth.social.openApp')}
                            </a>
                            <p className="text-center text-xs text-muted-foreground">{t('auth.social.closeTab')}</p>
                        </>
                    )
                )}
            </div>
        </AuthCard>
    );
};
