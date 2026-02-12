import { Route, Routes } from 'react-router-dom';

import { ChatRoomPage } from './pages/ChatRoomPage';

export const ChatRoutes = () => {
    return (
        <Routes>
            <Route path=":channelId/room" element={<ChatRoomPage />} />
        </Routes>
    );
};
