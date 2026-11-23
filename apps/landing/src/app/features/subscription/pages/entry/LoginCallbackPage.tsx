import { type JSX, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { AuthCard } from '../../components';
import { useCompleteSignIn } from '../../hooks';
import { isPortError } from '../../lib/port';
import { landingAfterSignIn, safeNext } from '../../lib/safeNext';
import { reasonOfSignInError } from './signInReason';

import type { NoLinkedAccountState } from './NoLinkedAccountPage';

export const LoginCallbackPage = (): JSX.Element => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { search } = useLocation();
    const completeSignIn = useCompleteSignIn();
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
                const next = safeNext(isPortError(error) ? error.detail?.next : undefined);
                if (next) query.set('next', next);
                navigate(`${ROUTES.subscription.login}?${query}`, { replace: true });
            });
    }, [completeSignIn, navigate, search]);

    return (
        <AuthCard role="status" className="items-center gap-2 pt-10 text-center md:py-12">
            <span
                aria-hidden
                className="mb-3 size-9 animate-spin rounded-full border-[3px] border-main-green border-t-transparent"
            />
            <h1 className="text-lg font-bold text-ink">{t('subscription.entry.login.completing')}</h1>
            <p className="text-[13px] font-medium text-mute">{t('subscription.entry.login.completingBody')}</p>
        </AuthCard>
    );
};
