import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

import { DebugLoginPage, InviteLoginPage, TokenLoginPage, WelcomePage } from './features/auth';
import { HomePage } from './features/chat';
import { DebugBadgeCountPage, DebugChatPage, DebugStatePage } from './features/debug';
import { ProfilePage } from './features/profile';
import { SettingsPage } from './features/settings';

export const AppRouter = () => {
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);

    return (
        <Router>
            <Routes>
                {isAuthenticated ? (
                    <>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        {import.meta.env.DEV && <Route path="/debug" element={<DebugStatePage />} />}
                        {import.meta.env.DEV && <Route path="/debug/chat" element={<DebugChatPage />} />}
                        {import.meta.env.DEV && <Route path="/debug/badge" element={<DebugBadgeCountPage />} />}
                        {/* Once authenticated, leave the auth screens — fixes invite login not advancing. */}
                        <Route path="/auth/*" element={<Navigate to="/" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                ) : (
                    <>
                        <Route path="/auth/token/:token" element={<TokenLoginPage />} />
                        <Route path="/auth/welcome" element={<WelcomePage />} />
                        <Route path="/auth/login" element={<InviteLoginPage />} />
                        {import.meta.env.DEV && <Route path="/auth/debug" element={<DebugLoginPage />} />}
                        <Route path="*" element={<Navigate to="/auth/welcome" replace />} />
                    </>
                )}
            </Routes>
        </Router>
    );
};
