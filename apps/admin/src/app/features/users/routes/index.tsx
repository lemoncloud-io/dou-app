import { Navigate, Route, Routes } from 'react-router-dom';

import { UsersPage } from '../pages';

import type { JSX } from 'react';

export const UsersRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/users" replace />} />
        </Routes>
    );
};
