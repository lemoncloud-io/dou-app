import { Fragment, type JSX, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ROUTES } from '../../../routes/paths';
import { AccountShell, DevScenarioPanel, MockPaymentWindow, PublicShell } from '../components';
import { ToastProvider } from '../components/ui';
import { subscriptionKeys } from '../hooks';
import { type PortSetup, createPortSetup } from '../lib/createPortSetup';
import { registerSubscriptionCopy } from '../lib/i18n';
import { MockControllerProvider } from '../lib/mock';
import { PortProvider, isPortError, useSupports } from '../lib/port';
import {
    MANAGEMENT_SCREENS_OPEN,
    type ManagementScreens,
    ManagementScreensProvider,
    useManagementScreens,
} from '../lib/screens';
import { sessionEndedRedirect } from '../lib/sessionEnded';
import { BillingHistoryPage, BillingInfoPage, PaymentMethodsPage } from '../pages/billing';
import {
    ChangePlanPage,
    CheckoutCompletePage,
    DowngradeScheduled,
    CheckoutEmailPage,
    CheckoutPage,
    CheckoutPaymentPage,
    CheckoutStatusPage,
} from '../pages/checkout';
import { MockProviderPage, MockReceiptPage } from '../pages/dev';
import { LoginCallbackPage, LoginPage, NoLinkedAccountPage, PlansPage, StoreManagedPage } from '../pages/entry';
import { CancelSubscriptionPage, SubscriptionDetailPage, SubscriptionListPage } from '../pages/manage';
import { RedirectIfSignedIn, RequireSession } from './guards';

// This chunk loading is the moment the subscription copy joins the site's translations.
registerSubscriptionCopy();

// One port per page load, made the first time the routes mount, so its state outlives remounts. The
// gate is fixed per host, so in practice only one of the two is ever made.
let accountSetup: PortSetup | undefined;
let catalogSetup: PortSetup | undefined;
const setupFor = (account: boolean): PortSetup =>
    account ? (accountSetup ??= createPortSetup({ account })) : (catalogSetup ??= createPortSetup({ account }));

/**
 * A query client that sends the reader to sign in whenever any call reports the session gone — the
 * one place `unauthenticated` is handled. No page catches it; every page simply stops where it is and
 * the reader comes back to it after signing in.
 */
const createQueryClient = (onUnauthenticated: () => void): QueryClient => {
    const onError = (error: unknown) => {
        if (isPortError(error, 'unauthenticated')) onUnauthenticated();
    };
    return new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            // Port errors are answers (a conflict, a limit), not blips to retry; the screens decide.
            queries: { retry: false, refetchOnWindowFocus: false },
            mutations: { retry: false },
        },
    });
};

/**
 * Everything under `/subscription`. The query client and the port are provided here and nowhere above:
 * the public pages have no session and no data layer, and this chunk is where both begin.
 *
 * `account` is the gate (`isSubscriptionAccountEnabled`): where it is shut the route table mounts this
 * at `/subscription/plans` only, and only the plans page is routed, on the catalog port.
 */
export const SubscriptionRoutes = ({
    account = true,
    setup = setupFor(account),
    management = MANAGEMENT_SCREENS_OPEN,
}: {
    account?: boolean;
    setup?: PortSetup;
    /** Which of the card and billing-email screens exist (`lib/screens.tsx`); a boolean for both. */
    management?: boolean | ManagementScreens;
}): JSX.Element => {
    const navigate = useNavigate();
    const location = useLocation();
    const locationRef = useRef(location);
    useEffect(() => {
        locationRef.current = location;
    }, [location]);

    const [queryClient] = useState(() => {
        const client: QueryClient = createQueryClient(() => {
            client.setQueryData(subscriptionKeys.session(), null);
            const target = sessionEndedRedirect(locationRef.current);
            // Where the account surface is shut there is no sign-in page to send anyone to.
            if (target && account) navigate(target, { replace: true });
        });
        return client;
    });

    const mock = !!setup.mock;
    const Host = setup.Host ?? Fragment;

    return (
        <QueryClientProvider client={queryClient}>
            <PortProvider port={setup.port} clock={setup.clock} supports={setup.supports}>
                <MockControllerProvider controller={setup.mock}>
                    <ToastProvider>
                        <ManagementScreensProvider open={management}>
                            <Host>{account ? <AccountRoutes mock={mock} /> : <CatalogRoutes />}</Host>
                        </ManagementScreensProvider>
                        {mock && <MockPaymentWindow />}
                        {mock && <DevScenarioPanel />}
                    </ToastProvider>
                </MockControllerProvider>
            </PortProvider>
        </QueryClientProvider>
    );
};

/**
 * The end of a checkout sits in two frames: a downgrade scheduled is an account page — the plan is
 * still in force, and the sidebar is where the reader goes next — while a purchase or an upgrade
 * finishes in the purchase flow's own frame.
 */
const CheckoutCompleteRoute = (): JSX.Element => {
    const [params] = useSearchParams();
    return params.get('change') === 'downgrade' ? (
        <AccountShell>
            <DowngradeScheduled />
        </AccountShell>
    ) : (
        <PublicShell>
            <CheckoutCompletePage />
        </PublicShell>
    );
};

/** Where the account surface is shut: the plans, mounted at `/subscription/plans`, and nothing else. */
const CatalogRoutes = (): JSX.Element => (
    <Routes>
        <Route element={<PublicShell account={false} />}>
            <Route index element={<PlansPage account={false} />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.subscription.plans} replace />} />
    </Routes>
);

const AccountRoutes = ({ mock }: { mock: boolean }): JSX.Element => {
    const screens = useManagementScreens();
    // The billing history is left out where the port has no server for it, like the hidden screens.
    const history = useSupports()('listInvoices');
    return (
        <Routes>
            <Route element={<PublicShell />}>
                <Route path="plans" element={<PlansPage />} />
                <Route
                    path="login"
                    element={
                        <RedirectIfSignedIn>
                            <LoginPage />
                        </RedirectIfSignedIn>
                    }
                />
                <Route path="login/callback" element={<LoginCallbackPage />} />
                <Route path="login/no-account" element={<NoLinkedAccountPage />} />
                <Route element={<RequireSession allowStoreBilled />}>
                    <Route path="store-managed" element={<StoreManagedPage />} />
                </Route>
                <Route element={<RequireSession />}>
                    {screens.emails && <Route path="checkout/email" element={<CheckoutEmailPage />} />}
                    <Route path="checkout" element={<CheckoutPage />} />
                    <Route path="checkout/payment" element={<CheckoutPaymentPage />} />
                    <Route path="checkout/status" element={<CheckoutStatusPage />} />
                    <Route path="change" element={<ChangePlanPage />} />
                </Route>
            </Route>
            <Route element={<RequireSession />}>
                <Route path="checkout/complete" element={<CheckoutCompleteRoute />} />
                <Route element={<AccountShell />}>
                    <Route index element={<SubscriptionListPage />} />
                    {screens.cards ? (
                        <Route path="payment-methods" element={<PaymentMethodsPage />} />
                    ) : (
                        // Not a screen, but a path the next route would take for a subscription's id.
                        <Route path="payment-methods" element={<Navigate to={ROUTES.subscription.root} replace />} />
                    )}
                    {history ? (
                        <Route path="history" element={<BillingHistoryPage />} />
                    ) : (
                        <Route path="history" element={<Navigate to={ROUTES.subscription.root} replace />} />
                    )}
                    {screens.emails ? (
                        <Route path="billing-info" element={<BillingInfoPage />} />
                    ) : (
                        <Route path="billing-info" element={<Navigate to={ROUTES.subscription.root} replace />} />
                    )}
                    <Route path=":subscriptionId" element={<SubscriptionDetailPage />} />
                    <Route path=":subscriptionId/cancel" element={<CancelSubscriptionPage />} />
                </Route>
            </Route>
            {mock && <Route path="login/mock-provider" element={<MockProviderPage />} />}
            {mock && <Route path="mock-receipt" element={<MockReceiptPage />} />}
            <Route path="*" element={<Navigate to={ROUTES.subscription.root} replace />} />
        </Routes>
    );
};
