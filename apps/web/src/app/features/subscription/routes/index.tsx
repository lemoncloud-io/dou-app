import { Route, Routes } from 'react-router-dom';

import { runtime } from '@chatic/runtime';

import { ShellCheckoutRequests } from '../components/ShellCheckoutRequests';
import { WebCheckoutHandoff } from '../components/WebCheckoutHandoff';
import { shellCheckoutScreen } from '../lib';
import { SHELL_CHECKOUT_ROUTE, ShellCheckoutPage } from '../pages/ShellCheckoutPage';
import {
    CloudGuidePage,
    KeepCloudsPage,
    SubscriptionConfirmPage,
    SubscriptionDetailPage,
    SubscriptionPage,
    SubscriptionPlansPage,
} from '../pages';

export const SubscriptionRoutes = () => {
    const shellScreen = shellCheckoutScreen(runtime.checkout);
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
                {shellScreen && <Route path={SHELL_CHECKOUT_ROUTE} element={<ShellCheckoutPage />} />}
            </Routes>
        </>
    );
};
