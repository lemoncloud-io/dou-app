import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from 'react-router-dom';

import { isNative, webClient } from '@chatic/bridges';
import { useWebCoreStore } from '@chatic/web-core';

import { AppShellSkeleton, useDebugModeStore, usePendingOpenStore } from './shared';

/**
 * Desktop-shell OS-notification click handler. Mounted inside the Router (so it
 * can navigate) and route-independent, so a click works from /profile or
 * /settings — not just the home route. Routes home and stashes the target;
 * HomePage applies it once its channels load.
 */
const NotificationOpenListener = () => {
    const navigate = useNavigate();
    const request = usePendingOpenStore(s => s.request);
    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnReceiveNotification', message => {
            const deeplink = (message?.data as { notification?: { data?: { deeplink?: string } } })?.notification?.data
                ?.deeplink;
            if (!deeplink?.startsWith('chatic-open:')) return;
            const [rawPlace, rawChannel] = deeplink.slice('chatic-open:'.length).split('|');
            const placeId = rawPlace ? decodeURIComponent(rawPlace) : '';
            const channelId = rawChannel ? decodeURIComponent(rawChannel) : '';
            if (!channelId) return;
            request(placeId, channelId);
            navigate('/');
        });
    }, [navigate, request]);
    return null;
};

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
const OAuthResponsePage = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthResponsePage })));
const OAuthDeeplinkListener = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthDeeplinkListener })));
const DebugStatePage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugStatePage })));
const DebugChatPage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugChatPage })));
const DebugBadgeCountPage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugBadgeCountPage })));
const DebugSyncPage = lazy(() => import('./features/debug').then(m => ({ default: m.DebugSyncPage })));

export const AppRouter = () => {
    const isAuthenticated = useWebCoreStore(s => s.isAuthenticated);
    // Debug routes are mounted in dev, or when debug mode is toggled on via the
    // hidden rail gesture (7× tap) — the latter works in packaged/prod builds too.
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const showDebug = import.meta.env.DEV || debugEnabled;

    return (
        <Router>
            {isAuthenticated && <NotificationOpenListener />}
            <Suspense fallback={<AppShellSkeleton />}>
                {/* Social Login deeplink (chatic://oauth) — pre-auth it signs in (router
                    flips branches); in-app (guest linking from Profile) it swaps the
                    session and reloads. */}
                <OAuthDeeplinkListener />
                <Routes>
                    {isAuthenticated ? (
                        <>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            {showDebug && <Route path="/debug" element={<DebugStatePage />} />}
                            {showDebug && <Route path="/debug/chat" element={<DebugChatPage />} />}
                            {showDebug && <Route path="/debug/badge" element={<DebugBadgeCountPage />} />}
                            {showDebug && <Route path="/debug/sync" element={<DebugSyncPage />} />}
                            {/* OAuth hand-off must work even with a (possibly stale) authenticated
                                session in this browser — the relay return would otherwise bounce
                                to home and lose the code before it reaches the shell. */}
                            <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                            {/* Once authenticated, leave the auth screens — fixes invite login not advancing. */}
                            <Route path="/auth/*" element={<Navigate to="/" replace />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                    ) : (
                        <>
                            <Route path="/auth/token/:token" element={<TokenLoginPage />} />
                            <Route path="/auth/welcome" element={<WelcomePage />} />
                            <Route path="/auth/login" element={<InviteLoginPage />} />
                            <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                            {import.meta.env.DEV && <Route path="/auth/debug" element={<DebugLoginPage />} />}
                            <Route path="*" element={<Navigate to="/auth/welcome" replace />} />
                        </>
                    )}
                </Routes>
            </Suspense>
        </Router>
    );
};
