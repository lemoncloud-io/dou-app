import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthGuard } from '../../../routes/guards';
import { DashboardPage } from '../pages';

export const DashboardRoutes = () => {
    return (
        <Routes>
            <Route
                index
                element={
                    <AuthGuard>
                        <DashboardPage />
                    </AuthGuard>
                }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
};
