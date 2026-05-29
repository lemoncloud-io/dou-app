import { Route, Routes } from 'react-router-dom';

import { DeepLinkPage } from '../pages';

export const DeepLinkRoutes = (): JSX.Element => {
    return (
        <Routes>
            <Route path="" element={<DeepLinkPage />} />
            <Route path="*" element={<DeepLinkPage />} />
        </Routes>
    );
};
