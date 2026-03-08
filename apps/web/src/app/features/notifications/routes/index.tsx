import { Route, Routes } from 'react-router-dom';

import { NotificationsPage } from '../pages';

export const NotificationsRoutes = () => {
    return (
        <Routes>
            <Route index element={<NotificationsPage />} />
        </Routes>
    );
};
