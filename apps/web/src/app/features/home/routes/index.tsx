import { Navigate, Route, Routes } from 'react-router-dom';

import { ResultPage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route index element={<ResultPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
