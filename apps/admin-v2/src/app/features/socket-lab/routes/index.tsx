import { Navigate, Route, Routes } from 'react-router-dom';

import { SocketMonitorPage } from '../pages';

export const SocketLabRoutes = () => {
    return (
        <Routes>
            <Route index element={<SocketMonitorPage />} />
            <Route path="*" element={<Navigate to="/socket-lab" replace />} />
        </Routes>
    );
};
