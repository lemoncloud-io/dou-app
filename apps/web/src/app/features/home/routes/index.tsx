import { Navigate, Route, Routes } from 'react-router-dom';

import { ResultPage } from '../pages';

export const HomeRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<ResultPage />} />
            <Route path="*" element={<Navigate to="/home"></Navigate>} />
        </Routes>
    );
};
