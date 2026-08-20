import { Route, Routes } from 'react-router-dom';

import { CloudGuidePage, SubscriptionCompletePage, SubscriptionPage, SubscriptionPlansPage } from '../pages';

export const SubscriptionRoutes = () => {
    return (
        <Routes>
            <Route index element={<SubscriptionPage />} />
            {/* Two screens, in order: `guide` argues why, `plans` asks which tier. Entry points may
                skip straight to `plans` — see CloudGuidePage for which ones and why. */}
            <Route path="guide" element={<CloudGuidePage />} />
            <Route path="plans" element={<SubscriptionPlansPage />} />
            <Route path="complete" element={<SubscriptionCompletePage />} />
        </Routes>
    );
};
