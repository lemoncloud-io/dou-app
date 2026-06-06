import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

import { InviteLoginPage, TokenLoginPage } from './features/auth';
import { HomePage } from './features/chat';
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
                        {/* Once authenticated, leave the auth screens — fixes invite login not advancing. */}
                        <Route path="/auth/*" element={<Navigate to="/" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                ) : (
                    <>
                        <Route path="/auth/token/:token" element={<TokenLoginPage />} />
                        <Route path="/auth/login" element={<InviteLoginPage />} />
                        <Route path="*" element={<Navigate to="/auth/login" replace />} />
                    </>
                )}
            </Routes>
        </Router>
    );
};
