import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '../../../shared';
import { DashboardPage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route element={<AdminLayout />}>
                <Route path="/home" element={<DashboardPage />} />
                <Route path="*" element={<Navigate to="/home" />} />
            </Route>
        </Routes>
    );
};
