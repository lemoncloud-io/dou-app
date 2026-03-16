import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthTestPage } from '../pages';

import type { JSX } from 'react';

export const AuthTestRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<AuthTestPage />} />
            <Route path="*" element={<Navigate to="/auth-test" replace />} />
        </Routes>
    );
};
