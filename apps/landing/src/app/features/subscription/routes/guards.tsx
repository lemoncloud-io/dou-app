import { type JSX } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';
import { PageLoader } from '../components';
import { useSession } from '../hooks';
import { landingAfterSignIn } from '../lib/safeNext';
import { signInRedirect } from '../lib/sessionEnded';

const isStoreBilled = (source: string) => source === 'appStore' || source === 'googlePlay';

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

export const RedirectIfSignedIn = ({ children }: { children: JSX.Element }): JSX.Element => {
    const session = useSession();
    const [params] = useSearchParams();

    if (session.isLoading) return <PageLoader />;
    if (session.data) return <Navigate to={landingAfterSignIn(session.data, params.get('next'))} replace />;
    return children;
};
