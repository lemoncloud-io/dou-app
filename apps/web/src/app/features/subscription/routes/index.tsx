import { Route, Routes } from 'react-router-dom';

import { WebCheckoutHandoff } from '../components/WebCheckoutHandoff';
import {
    CloudGuidePage,
    KeepCloudsPage,
    SubscriptionConfirmPage,
    SubscriptionDetailPage,
    SubscriptionPage,
    SubscriptionPlansPage,
} from '../pages';

/**
 * The subscription flow, in the order a person walks it: the list, the detail, the guide (why) and
 * the picker (which tier), the confirmation before the store opens, and — after a downgrade — the
 * clouds to keep. Entry points may skip ahead: home's add-cloud goes straight to the picker.
 *
 * The picker and the confirmation sell through a store, so outside the app they hand the reader to the
 * website's checkout instead (`WebCheckoutHandoff`).
 */
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
        </Routes>
    );
};
