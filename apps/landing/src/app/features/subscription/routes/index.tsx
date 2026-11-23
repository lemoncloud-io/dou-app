import { Fragment, type JSX, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ROUTES } from '../../../routes/paths';
import { AccountShell, CardEntryWindow, DevTools, MockPaymentWindow, PublicShell } from '../components';
import { ToastProvider } from '../components/ui';
import { subscriptionKeys } from '../hooks';
import { type PortSetup, createPortSetup } from '../lib/createPortSetup';
import { registerSubscriptionCopy } from '../lib/i18n';
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
import { LoginCallbackPage, LoginPage, NoLinkedAccountPage, PlansPage, StoreManagedPage } from '../pages/entry';
import { CancelSubscriptionPage, SubscriptionDetailPage, SubscriptionListPage } from '../pages/manage';
import { RedirectIfSignedIn, RequireSession } from './guards';

registerSubscriptionCopy();

let accountSetup: PortSetup | undefined;
let catalogSetup: PortSetup | undefined;
const setupFor = (account: boolean): PortSetup =>
    account ? (accountSetup ??= createPortSetup({ account })) : (catalogSetup ??= createPortSetup({ account }));

const createQueryClient = (onUnauthenticated: () => void): QueryClient => {
    const onError = (error: unknown) => {
        if (isPortError(error, 'unauthenticated')) onUnauthenticated();
    };
    return new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
            mutations: { retry: false },
        },
    });
};

export const SubscriptionRoutes = ({
    account = true,
    setup = setupFor(account),
    management = MANAGEMENT_SCREENS_OPEN,
}: {
    account?: boolean;
    setup?: PortSetup;
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
            if (target && account) navigate(target, { replace: true });
        });
        return client;
    });

    const Host = setup.Host ?? Fragment;

    return (
        <QueryClientProvider client={queryClient}>
            <PortProvider port={setup.port} clock={setup.clock} supports={setup.supports}>
                <ToastProvider>
                    <ManagementScreensProvider open={management}>
                        <Host>{account ? <AccountRoutes /> : <CatalogRoutes />}</Host>
                    </ManagementScreensProvider>
                    {setup.cardEntry && <CardEntryWindow channel={setup.cardEntry} />}
                    {setup.standInWindow && <MockPaymentWindow host={setup.standInWindow} />}
                    <DevTools setup={setup} />
                </ToastProvider>
            </PortProvider>
        </QueryClientProvider>
    );
};

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

const CatalogRoutes = (): JSX.Element => (
    <Routes>
        <Route element={<PublicShell account={false} />}>
            <Route index element={<PlansPage account={false} />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.subscription.plans} replace />} />
    </Routes>
);

const AccountRoutes = (): JSX.Element => {
    const screens = useManagementScreens();
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
            <Route path="*" element={<Navigate to={ROUTES.subscription.root} replace />} />
        </Routes>
    );
};
