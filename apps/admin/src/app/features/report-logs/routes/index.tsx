import { Navigate, Route, Routes } from 'react-router-dom';

import { ReportLogsPage } from '../pages';

export const ReportLogsRoutes = () => {
    return (
        <Routes>
            <Route index element={<ReportLogsPage />} />
            <Route path="*" element={<Navigate to="/report-logs" replace />} />
        </Routes>
    );
};
