import { Route, Routes } from 'react-router-dom';

import { CloudDeploymentsPage } from '../pages/CloudDeploymentsPage';

export const CloudDeploymentsRoutes = () => (
    <Routes>
        <Route index element={<CloudDeploymentsPage />} />
    </Routes>
);
