import { Route, Routes } from 'react-router-dom';

import { ChannelRoomPage, ChannelSettingsPage, InviteLinkPage, InvitePage, ThreadPage } from './pages';

export const ChannelRoutes = () => {
    return (
        <Routes>
            <Route path=":channelId/room" element={<ChannelRoomPage />} />
            <Route path=":channelId/thread/:rootNo" element={<ThreadPage />} />
            <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
            <Route path=":channelId/invite" element={<InvitePage />} />
            <Route path=":channelId/invite/link" element={<InviteLinkPage />} />
        </Routes>
    );
};
