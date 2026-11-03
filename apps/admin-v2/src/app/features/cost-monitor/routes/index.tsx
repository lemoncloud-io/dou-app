import { Route, Routes } from 'react-router-dom';

import { CostMonitorPage } from '../pages/CostMonitorPage';

export const CostMonitorRoutes = () => (
    <Routes>
        <Route index element={<CostMonitorPage />} />
    </Routes>
);
