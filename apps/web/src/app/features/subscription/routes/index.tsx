import { Route, Routes } from 'react-router-dom';

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
 */
export const SubscriptionRoutes = () => {
    return (
        <Routes>
            <Route index element={<SubscriptionPage />} />
            <Route path="detail" element={<SubscriptionDetailPage />} />
            <Route path="guide" element={<CloudGuidePage />} />
            <Route path="plans" element={<SubscriptionPlansPage />} />
            <Route path="confirm" element={<SubscriptionConfirmPage />} />
            <Route path="keep" element={<KeepCloudsPage />} />
        </Routes>
    );
};
