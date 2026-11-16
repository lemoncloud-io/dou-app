import { Route, Routes } from 'react-router-dom';

import { NotificationsPage } from '../pages/NotificationsPage';

export const NotificationRoutes = () => (
    <Routes>
        <Route index element={<NotificationsPage />} />
    </Routes>
);
