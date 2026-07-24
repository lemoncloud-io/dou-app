import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthRoutes } from './features/auth/routes';
import { ReportLogsRoutes } from './features/report-logs';
import { SocketLabRoutes } from './features/socket-lab';
import { PrivateLayout } from './layout/PrivateLayout';

export const AppRoutes = () => (
    <Routes>
        <Route path="/auth/*" element={<AuthRoutes />} />
        <Route
            element={
                <ProtectedRoute>
                    <PrivateLayout />
                </ProtectedRoute>
            }
        >
            <Route path="/" element={<Navigate to="/socket-lab" replace />} />
            <Route path="/socket-lab/*" element={<SocketLabRoutes />} />
            <Route path="/report-logs/*" element={<ReportLogsRoutes />} />
        </Route>
        <Route path="*" element={<Navigate to="/socket-lab" replace />} />
    </Routes>
);
