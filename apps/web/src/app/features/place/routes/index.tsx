import { Route, Routes } from 'react-router-dom';

import { PlaceInfoPage } from '../pages';

export const PlaceRoutes = () => {
    return (
        <Routes>
            <Route path=":placeId" element={<PlaceInfoPage />} />
        </Routes>
    );
};
