import { Route, Routes } from 'react-router-dom';

import { CloudGuidePage, SubscriptionPage, SubscriptionPlansPage } from '../pages';

export const SubscriptionRoutes = () => {
    return (
        <Routes>
            <Route index element={<SubscriptionPage />} />
            <Route path="plans" element={<SubscriptionPlansPage />} />
            <Route path="guide" element={<CloudGuidePage />} />
        </Routes>
    );
};
