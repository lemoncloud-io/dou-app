import { Route, Routes } from 'react-router-dom';

import { ExplorePage } from '../pages';

export const ExploreRoutes = () => {
    return (
        <Routes>
            <Route index element={<ExplorePage />} />
        </Routes>
    );
};
