import { Navigate, Route, Routes } from 'react-router-dom';

import { SignUpPage } from '../pages';

export const PublishingRoutes = () => {
    return (
        <Routes>
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
