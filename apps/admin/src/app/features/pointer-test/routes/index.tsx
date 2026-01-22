import { Navigate, Route, Routes } from 'react-router-dom';

import { PointerTestPage } from '../pages';

export const PointerTestRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<PointerTestPage />} />
            <Route path="*" element={<Navigate to="/pointer-test" replace />} />
        </Routes>
    );
};
