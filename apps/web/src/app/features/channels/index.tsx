import { Route, Routes } from 'react-router-dom';

import {
    ChannelRoomPage,
    ChannelSettingsPage,
    CloudDmPickerPage,
    InviteLinkPage,
    InvitePage,
    ThreadPage,
} from './pages';

export const ChannelRoutes = () => {
    return (
        <Routes>
            {/* Static, so it outranks `:channelId` — and it is one segment deep where every
                other route here is two, so the two cannot meet. */}
            <Route path="start-dm" element={<CloudDmPickerPage />} />
            <Route path=":channelId/room" element={<ChannelRoomPage />} />
            <Route path=":channelId/thread/:rootNo" element={<ThreadPage />} />
            <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
            <Route path=":channelId/invite" element={<InvitePage />} />
            <Route path=":channelId/invite/link" element={<InviteLinkPage />} />
        </Routes>
    );
};
