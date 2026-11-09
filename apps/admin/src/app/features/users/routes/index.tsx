import { Route, Routes } from 'react-router-dom';

import { UsersPage } from '../pages/UsersPage';

export const UsersRoutes = () => (
    <Routes>
        <Route index element={<UsersPage />} />
    </Routes>
);
