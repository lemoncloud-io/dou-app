import { Route, Routes } from 'react-router-dom';

import {
    PlaceChannelManagePage,
    PlaceDetailPage,
    PlaceEditPage,
    PlaceMembersPage,
    PlaceProfilePage,
    PlaceSettingsHubPage,
} from '../pages';

export const PlaceRoutes = () => {
    return (
        <Routes>
            <Route path=":placeId" element={<PlaceDetailPage />} />
            <Route path=":placeId/settings" element={<PlaceSettingsHubPage />} />
            <Route path=":placeId/settings/detail" element={<PlaceDetailPage />} />
            <Route path=":placeId/settings/edit" element={<PlaceEditPage />} />
            <Route path=":placeId/settings/profile" element={<PlaceProfilePage />} />
            <Route path=":placeId/settings/channels" element={<PlaceChannelManagePage />} />
            <Route path=":placeId/settings/members" element={<PlaceMembersPage />} />
        </Routes>
    );
};
