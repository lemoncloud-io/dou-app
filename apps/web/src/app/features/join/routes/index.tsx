import { Route, Routes } from 'react-router-dom';

import { JoinByCodePage } from '../pages';

export const JoinRoutes = () => {
    return (
        <Routes>
            <Route index element={<JoinByCodePage />} />
        </Routes>
    );
};
