import { Route, Routes } from 'react-router-dom';

import { SharePage } from '../pages/SharePage';

export const ShareRoutes = () => (
    <Routes>
        <Route index element={<SharePage />} />
    </Routes>
);
