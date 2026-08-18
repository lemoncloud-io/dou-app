import { Route, Routes } from 'react-router-dom';

import { SubscriptionCompletePage, SubscriptionPage, SubscriptionPlansPage } from '../pages';

export const SubscriptionRoutes = () => {
    return (
        <Routes>
            <Route index element={<SubscriptionPage />} />
            {/* `plans` is the merged guide + picker; the old read-only `guide` screen folded into it. */}
            <Route path="plans" element={<SubscriptionPlansPage />} />
            <Route path="complete" element={<SubscriptionCompletePage />} />
        </Routes>
    );
};
