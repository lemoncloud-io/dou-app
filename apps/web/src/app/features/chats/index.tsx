import { Route, Routes } from 'react-router-dom';

import { ChatRoomPage, ChatSettingsPage, RoomNotificationSettingsPage } from './pages';

export const ChatRoutes = () => {
    return (
        <Routes>
            <Route path=":channelId/room" element={<ChatRoomPage />} />
            <Route path=":channelId/settings" element={<ChatSettingsPage />} />
            <Route path=":channelId/settings/notifications" element={<RoomNotificationSettingsPage />} />
        </Routes>
    );
};
