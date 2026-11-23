import { Route, Routes } from 'react-router-dom';

import { RoomAudioHost } from './components/RoomAudioHost';
import {
    AudioDetailPage,
    ChannelRoomPage,
    ChannelSettingsPage,
    CloudDmPickerPage,
    InviteLinkPage,
    InvitePage,
    RoomFilesPage,
    ThreadPage,
} from './pages';

export const ChannelRoutes = () => {
    return (
        <>
            <RoomAudioHost />
            <Routes>
                <Route path="start-dm" element={<CloudDmPickerPage />} />
                <Route path=":channelId/room" element={<ChannelRoomPage />} />
                <Route path=":channelId/thread/:rootNo" element={<ThreadPage />} />
                <Route path=":channelId/audio/:chatNo/:idx" element={<AudioDetailPage />} />
                <Route path=":channelId/files" element={<RoomFilesPage />} />
                <Route path=":channelId/settings" element={<ChannelSettingsPage />} />
                <Route path=":channelId/invite" element={<InvitePage />} />
                <Route path=":channelId/invite/link" element={<InviteLinkPage />} />
            </Routes>
        </>
    );
};
