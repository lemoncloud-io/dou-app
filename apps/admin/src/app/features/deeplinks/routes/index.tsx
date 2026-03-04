import { Navigate, Route, Routes } from 'react-router-dom';

import { DeeplinksPage } from '../pages';

import type { JSX } from 'react';

export const DeeplinksRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route index element={<DeeplinksPage />} />
            <Route path="*" element={<Navigate to="/deeplinks" replace />} />
        </Routes>
    );
};
