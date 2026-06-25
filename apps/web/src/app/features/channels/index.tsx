import { Route, Routes } from 'react-router-dom';

import { ChannelRoomPage, ChannelSettingsPage, CreateRoomPage, RoomNotificationSettingsPage } from './pages';

export const ChannelRoutes = () => {
    return (
        <Routes>
            <Route path="create" element={<CreateRoomPage />} />
            <Route path=":channelId/room" element={<ChannelRoomPage />} />
            <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
            <Route path=":channelId/settings/notifications" element={<RoomNotificationSettingsPage />} />
        </Routes>
    );
};
