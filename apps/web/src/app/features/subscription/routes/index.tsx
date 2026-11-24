import { Route, Routes } from 'react-router-dom';

import { InAppCheckoutRoute } from '../components/InAppCheckoutRoute';
import { WebCheckoutHandoff } from '../components/WebCheckoutHandoff';
import { IN_APP_CHECKOUT_ROUTE } from '../lib';
import {
    CloudGuidePage,
    KeepCloudsPage,
    SubscriptionConfirmPage,
    SubscriptionDetailPage,
    SubscriptionPage,
    SubscriptionPlansPage,
} from '../pages';

export const SubscriptionRoutes = () => {
    return (
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
            <Route path={IN_APP_CHECKOUT_ROUTE} element={<InAppCheckoutRoute />} />
        </Routes>
    );
};
