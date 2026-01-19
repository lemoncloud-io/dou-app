import { Navigate, Route, Routes } from 'react-router-dom';

import { SocketTestPage } from '../pages';

export const SocketTestRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<SocketTestPage />} />
            <Route path="*" element={<Navigate to="/socket-test" replace />} />
        </Routes>
    );
};
