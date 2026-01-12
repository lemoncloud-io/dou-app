import { Navigate, Route, Routes } from 'react-router-dom';

import { HomePage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route index element={<HomePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
