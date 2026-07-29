import { Route, Routes } from 'react-router-dom';

import { PlaceChannelManagePage, PlaceInfoPage, PlaceProfilePage, PlaceSettingsHubPage } from '../pages';

export const PlaceRoutes = () => {
    return (
        <Routes>
            {/* Legacy direct entry (kept for ROUTES.place.detail). */}
            <Route path=":placeId" element={<PlaceInfoPage />} />
            {/* Settings hub + sub-pages, reached from the home profile dropdown. */}
            <Route path=":placeId/settings" element={<PlaceSettingsHubPage />} />
            <Route path=":placeId/settings/info" element={<PlaceInfoPage />} />
            <Route path=":placeId/settings/profile" element={<PlaceProfilePage />} />
            <Route path=":placeId/settings/channels" element={<PlaceChannelManagePage />} />
        </Routes>
    );
};
