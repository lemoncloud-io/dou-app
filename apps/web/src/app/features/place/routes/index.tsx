import { Route, Routes } from 'react-router-dom';

import { PlaceInfoPage, PlaceOrderPage } from '../pages';

export const PlaceRoutes = () => {
    return (
        <Routes>
            <Route path="order" element={<PlaceOrderPage />} />
            <Route path=":placeId" element={<PlaceInfoPage />} />
        </Routes>
    );
};
