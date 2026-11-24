import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { runtime } from '@chatic/runtime';

import { ShellCheckoutRequests } from '../components/ShellCheckoutRequests';
import { WebCheckoutHandoff } from '../components/WebCheckoutHandoff';
import { SHELL_CHECKOUT_ROUTE, shellCheckoutScreen } from '../lib';
import {
    CloudGuidePage,
    KeepCloudsPage,
    SubscriptionConfirmPage,
    SubscriptionDetailPage,
    SubscriptionPage,
    SubscriptionPlansPage,
} from '../pages';

const ShellCheckoutPage =
    import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL'
        ? lazy(() =>
              import('../pages/shellCheckout/ShellCheckoutPage').then(module => ({ default: module.ShellCheckoutPage }))
          )
        : null;

export const SubscriptionRoutes = () => {
    const shellScreen = ShellCheckoutPage ? shellCheckoutScreen(runtime.checkout) : null;
    return (
        <>
            {shellScreen && <ShellCheckoutRequests screen={shellScreen} />}
            <Routes>
                <Route index element={<SubscriptionPage />} />
                <Route path="detail" element={<SubscriptionDetailPage />} />
                <Route path="guide" element={<CloudGuidePage />} />
                <Route
                    path="plans"
                    element={
                        <WebCheckoutHandoff>
                            <SubscriptionPlansPage />
                        </WebCheckoutHandoff>
                    }
                />
                <Route
                    path="confirm"
                    element={
                        <WebCheckoutHandoff>
                            <SubscriptionConfirmPage />
                        </WebCheckoutHandoff>
                    }
                />
                <Route path="keep" element={<KeepCloudsPage />} />
                {shellScreen && ShellCheckoutPage && (
                    <Route
                        path={SHELL_CHECKOUT_ROUTE}
                        element={
                            <Suspense fallback={null}>
                                <ShellCheckoutPage />
                            </Suspense>
                        }
                    />
                )}
            </Routes>
        </>
    );
};
