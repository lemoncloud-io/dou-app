import { Navigate, Route, Routes } from 'react-router-dom';

import { UserPage } from '../pages';

import type { JSX } from 'react';

export const DeeplinkTestRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route path=":userId" element={<UserPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
