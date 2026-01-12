import { Navigate, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '../pages';

export const DashboardRoutes = () => {
    return (
        <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
