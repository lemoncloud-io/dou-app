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
            {/* The room's one audio player, above the routes so moving between the room, a thread,
                an audio file and the file list never interrupts it; leaving the channel stops it. */}
            <RoomAudioHost />
            <Routes>
                {/* Static, so it outranks `:channelId` — and it is one segment deep where every
                    other route here is two, so the two cannot meet. */}
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
