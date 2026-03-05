import { Navigate, Route, Routes } from 'react-router-dom';

import { HomePage } from '../pages';

export const HomeRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<HomePage />} />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};
