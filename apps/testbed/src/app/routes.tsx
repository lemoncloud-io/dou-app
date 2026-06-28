import { Navigate, Route, Routes as ReactRoutes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ChatHomePage } from './pages/ChatHomePage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { InvitePage } from './pages/InvitePage';
import { ChatRoomPage } from './pages/ChatRoomPage';

export const Routes = () => (
    <ReactRoutes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route element={<AppShell />}>
            <Route path="/chat" element={<ChatHomePage />} />
            <Route path="/chat/channels/:channelId" element={<ChatRoomPage />} />
            <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/invite" element={<InvitePage />} />
    </ReactRoutes>
);
