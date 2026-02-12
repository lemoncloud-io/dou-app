import { Route, Routes } from 'react-router-dom';

import { ChatRoomPage } from './pages/ChatRoomPage';
import { ChatSettingsPage } from './pages/ChatSettingsPage';

export const ChatRoutes = () => {
    return (
        <Routes>
            <Route path=":channelId/room" element={<ChatRoomPage />} />
            <Route path=":channelId/settings" element={<ChatSettingsPage />} />
        </Routes>
    );
};
