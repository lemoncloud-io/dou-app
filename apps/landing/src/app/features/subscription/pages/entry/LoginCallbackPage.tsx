import { type JSX, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { Card } from '../../components/ui';
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
        <div className="flex justify-center pt-6">
            <Card
                role="status"
                className="flex w-full max-w-[440px] flex-col items-center gap-2 px-6 py-10 sm:px-10 sm:py-12 text-center"
            >
                {/* Larger than the inline spinner, in the brand green: this is the whole page while it lasts. */}
                <span
                    aria-hidden
                    className="mb-4 h-11 w-11 animate-spin rounded-full border-[3px] border-main-green border-t-transparent"
                />
                <h1 className="text-xl font-bold text-navy">{t('subscription.entry.login.completing')}</h1>
                <p className="text-sm text-subtitle">{t('subscription.entry.login.completingBody')}</p>
            </Card>
        </div>
    );
};
