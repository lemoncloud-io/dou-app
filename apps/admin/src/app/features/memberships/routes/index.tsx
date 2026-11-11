import { Route, Routes } from 'react-router-dom';

import { MembershipsPage } from '../pages/MembershipsPage';

export const MembershipsRoutes = () => (
    <Routes>
        <Route index element={<MembershipsPage />} />
    </Routes>
);
