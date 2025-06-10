import { Navigate, Route, Routes } from 'react-router-dom';

import { DashboardPage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="*" element={<Navigate to="/home"></Navigate>} />
        </Routes>
    );
};
