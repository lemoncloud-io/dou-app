import { Suspense, lazy } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { useWebCoreStore } from '@chatic/web-core';

import { AppShellSkeleton } from './shared';

// Route-level code splitting: the auth branch, the messenger shell, and the
// settings/profile/debug pages each become their own chunk, so the initial load
// ships only what the current branch needs. (Named exports → default mapping.)
const HomePage = lazy(() => import('./features/chat').then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import('./features/profile').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./features/settings').then(m => ({ default: m.SettingsPage })));
const WelcomePage = lazy(() => import('./features/auth').then(m => ({ default: m.WelcomePage })));
const InviteLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.InviteLoginPage })));
const TokenLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.TokenLoginPage })));
const DebugLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.DebugLoginPage })));
const DebugStatePage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugStatePage })));
const DebugChatPage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugChatPage })));
const DebugBadgeCountPage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugBadgeCountPage })));

export const AppRouter = () => {
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);

    return (
        <Router>
            <Suspense fallback={<AppShellSkeleton />}>
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
            </Suspense>
        </Router>
    );
};
