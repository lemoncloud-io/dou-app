import { runtime } from '@chatic/runtime';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@chatic/ui-kit';

import { AuthCard } from '../components';
import { useSocialLogin } from '../hooks';
import { buildAppDeeplink, buildOAuthDeeplink } from '../utils';
import { tabStore } from '../../../storage';

const HANDOFF_SENT_KEY = 'chatic-oauth-handoff-sent';

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
    const completesInPlace = runtime.signIn.relayOAuth?.returnedCode === 'complete';

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;
        if (!isComplete) return;

        if (completesInPlace) {
            void completeFromHandoff({ provider, code, nonce }).then(done => {
                if (done === 'link') navigate('/account', { replace: true });
            });
            return;
        }
        const url = buildOAuthDeeplink(provider, code, nonce);
        setDeeplink(url);
        if (tabStore.get(HANDOFF_SENT_KEY) === nonce) return;
        tabStore.set(HANDOFF_SENT_KEY, nonce);
        window.location.replace(url);
    }, [isComplete, provider, code, nonce, completeFromHandoff, navigate, completesInPlace]);

    const failed = !isComplete || isError;
    const inApp = completesInPlace;

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
