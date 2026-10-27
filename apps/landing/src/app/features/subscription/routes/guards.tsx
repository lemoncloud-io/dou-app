import { type JSX } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';
import { DesktopOnlyNotice, PageLoader } from '../components';
import { useNarrowViewport, useSession } from '../hooks';
import { landingAfterSignIn } from '../lib/safeNext';
import { signInRedirect } from '../lib/sessionEnded';

const isStoreBilled = (source: string) => source === 'appStore' || source === 'googlePlay';

/**
 * The pages that need a signed-in reader. Without a session it sends them to sign in and back here
 * afterwards. A store subscriber is sent to the store notice instead — their subscription is changed
 * in the store, so nothing on these pages applies — unless `allowStoreBilled`, which is the notice
 * itself.
 */
export const RequireSession = ({ allowStoreBilled = false }: { allowStoreBilled?: boolean }): JSX.Element => {
    const session = useSession();
    const location = useLocation();

    if (session.isLoading) return <PageLoader />;
    if (!session.data) return <Navigate to={signInRedirect(location)} replace />;
    if (!allowStoreBilled && isStoreBilled(session.data.billingSource)) {
        return <Navigate to={ROUTES.subscription.storeManaged} replace />;
    }
    return <Outlet />;
};

/** The sign-in page for someone already signed in: on to `next`, or to where a sign-in lands. */
export const RedirectIfSignedIn = ({ children }: { children: JSX.Element }): JSX.Element => {
    const session = useSession();
    const [params] = useSearchParams();

    if (session.isLoading) return <PageLoader />;
    if (session.data) return <Navigate to={landingAfterSignIn(session.data, params.get('next'))} replace />;
    return children;
};

/** W-23 in place of any subscription page on a phone-width screen. */
export const DesktopOnlyGuard = ({ account, children }: { account: boolean; children: JSX.Element }): JSX.Element => {
    const narrow = useNarrowViewport();
    return narrow ? <DesktopOnlyNotice account={account} /> : children;
};
