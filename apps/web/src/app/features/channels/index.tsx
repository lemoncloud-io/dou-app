import { Route, Routes } from 'react-router-dom';

import { ChannelRoomPage, ChannelSettingsPage } from './pages';

export const ChannelRoutes = () => {
    return (
        <Routes>
            <Route path=":channelId/room" element={<ChannelRoomPage />} />
            <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
        </Routes>
    );
};
