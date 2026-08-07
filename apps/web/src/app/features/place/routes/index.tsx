import { Route, Routes } from 'react-router-dom';

import {
    PlaceChannelManagePage,
    PlaceDetailPage,
    PlaceEditPage,
    PlaceProfilePage,
    PlaceSettingsHubPage,
} from '../pages';

export const PlaceRoutes = () => {
    return (
        <Routes>
            {/* `ROUTES.place.detail` — now the read-only information screen, which is what the name
                always said. It had no production caller while it pointed at the edit page. */}
            <Route path=":placeId" element={<PlaceDetailPage />} />
            {/* Settings hub + sub-pages, reached from the home profile dropdown. */}
            <Route path=":placeId/settings" element={<PlaceSettingsHubPage />} />
            <Route path=":placeId/settings/detail" element={<PlaceDetailPage />} />
            <Route path=":placeId/settings/edit" element={<PlaceEditPage />} />
            <Route path=":placeId/settings/profile" element={<PlaceProfilePage />} />
            <Route path=":placeId/settings/channels" element={<PlaceChannelManagePage />} />
        </Routes>
    );
};
