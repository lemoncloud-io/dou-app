import { Route, Routes, Navigate } from 'react-router-dom';

import { DeepLinkPage } from '../pages';

export const DeepLinkRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route path="*" element={<DeepLinkPage />} />
            <Route path="" element={<Navigate to="/" replace />} />
        </Routes>
    );
};
