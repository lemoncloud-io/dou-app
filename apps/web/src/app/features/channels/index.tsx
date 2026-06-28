import { Route, Routes } from 'react-router-dom';

import { ChannelRoomPage, ChannelSettingsPage, CreateChannelPage } from './pages';

export const ChannelRoutes = () => {
    return (
        <Routes>
            <Route path="create" element={<CreateChannelPage />} />
            <Route path=":channelId/room" element={<ChannelRoomPage />} />
            <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
        </Routes>
    );
};
