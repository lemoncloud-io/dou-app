import { type JSX, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { Spinner } from '../../components/ui';
import { useCompleteSignIn } from '../../hooks';
import { isPortError } from '../../lib/port';
import { landingAfterSignIn, safeNext } from '../../lib/safeNext';
import { reasonOfSignInError } from './signInReason';

import type { NoLinkedAccountState } from './NoLinkedAccountPage';

/**
 * W-02 return — where the provider sends the reader back. Hands the callback query to the port once
 * and goes on by the answer: where a sign-in lands, the no-linked-account page, or back to sign in
 * with the reason it failed.
 */
export const LoginCallbackPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { search } = useLocation();
    const completeSignIn = useCompleteSignIn();
    // The sign-in record is spent by the first exchange — a second one would report an expired
    // sign-in — and StrictMode runs effects twice in development, so the exchange is started once
    // per mount.
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        completeSignIn
            .mutateAsync(new URLSearchParams(search))
            .then(result => {
                if ('noLinkedAccount' in result) {
                    const state: NoLinkedAccountState = { provider: result.provider, hint: result.hint };
                    navigate(ROUTES.subscription.noLinkedAccount, { replace: true, state });
                } else {
                    navigate(landingAfterSignIn(result.account, result.next), { replace: true });
                }
            })
            .catch(error => {
                const query = new URLSearchParams({ reason: reasonOfSignInError(error) });
                // A failed round trip still knows where it was going; trying again should go there too.
                const next = safeNext(isPortError(error) ? error.detail?.next : undefined);
                if (next) query.set('next', next);
                navigate(`${ROUTES.subscription.login}?${query}`, { replace: true });
            });
    }, [completeSignIn, navigate, search]);

    return (
        <div className="flex min-h-[240px] items-center justify-center gap-3 text-[15px] text-subtitle">
            <Spinner />
            <p>{t('subscription.entry.login.completing')}</p>
        </div>
    );
};
