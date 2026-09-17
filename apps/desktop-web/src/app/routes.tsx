import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from 'react-router-dom';

import { isNative, webClient } from '@chatic/bridges';
import { LoadingFallback } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';

import { useQuickSwitcherStore } from './features/chat/stores/useQuickSwitcherStore';
import { useShortcutsDialogStore } from './features/chat/stores/useShortcutsDialogStore';
import { useSearchDialogStore } from './features/search/stores/useSearchDialogStore';
import { AppShellSkeleton, parsePushDeeplink, usePendingOpenStore } from './shared';

/**
 * Desktop notification-open router. Mounted inside the Router (so it can
 * navigate) and route-independent, so opening works from /profile or /settings —
 * not just home. Two entry points feed the same pending-open store:
 *   - the OS-banner click, delivered as an `OnReceiveNotification` deeplink
 *     (same-cloud, cross-cloud, and the thread-reply form that also carries the
 *     root — see parsePushDeeplink), and
 *   - the in-app toast click (foreground), which sets the store directly.
 * Whenever a target is set it routes home; HomePage applies the cloud/place/
 * channel target once each loads.
 */
const NotificationOpenListener = () => {
    const navigate = useNavigate();
    const request = usePendingOpenStore(s => s.request);
    const pendingNonce = usePendingOpenStore(s => s.target?.nonce);
    // Any open request (banner OR toast) routes home. Guard on a live target so
    // HomePage clearing it back to null doesn't re-navigate.
    useEffect(() => {
        if (pendingNonce == null) return;
        navigate('/');
    }, [pendingNonce, navigate]);
    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnReceiveNotification', message => {
            const deeplink = (message?.data as { notification?: { data?: { deeplink?: string } } })?.notification?.data
                ?.deeplink;
            // The shell's menu bar (Settings, Go, Help → Keyboard Shortcuts) rides the same
            // event with a `chatic-ui:` link rather than an open target.
            if (deeplink === 'chatic-ui:settings') {
                navigate('/settings');
                return;
            }
            if (deeplink === 'chatic-ui:shortcuts') {
                useShortcutsDialogStore.getState().setOpen(true);
                return;
            }
            // The switcher and search are mounted by the home screen, so go there first.
            if (deeplink === 'chatic-ui:switcher' || deeplink === 'chatic-ui:search') {
                navigate('/');
                if (deeplink === 'chatic-ui:switcher') useQuickSwitcherStore.getState().setOpen(true);
                else useSearchDialogStore.getState().setOpen(true);
                return;
            }
            const target = parsePushDeeplink(deeplink);
            if (!target) return;
            request(target);
        });
    }, [request, navigate]);
    return null;
};

// Route-level code splitting: the auth branch, the messenger shell, and the
// settings/profile/debug pages each become their own chunk, so the initial load
// ships only what the current branch needs. (Named exports → default mapping.)
const ShortcutsDialog = lazy(() => import('./features/chat').then(m => ({ default: m.ShortcutsDialog })));
const HomePage = lazy(() => import('./features/chat').then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import('./features/profile').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./features/settings').then(m => ({ default: m.SettingsPage })));
const WelcomePage = lazy(() => import('./features/auth').then(m => ({ default: m.WelcomePage })));
const InviteLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.InviteLoginPage })));
const DebugLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.DebugLoginPage })));
const OAuthResponsePage = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthResponsePage })));
const OAuthDeeplinkListener = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthDeeplinkListener })));

export const AppRouter = () => {
    const { isAuthenticated } = runtime.session.useSessionAuth();

    return (
        <Router>
            {isAuthenticated && <NotificationOpenListener />}
            {/* Route-independent, so "?" and the menu entry work on every page. */}
            {isAuthenticated && (
                // Its own boundary: the chat chunk loading must not blank the page.
                <Suspense fallback={null}>
                    <ShortcutsDialog />
                </Suspense>
            )}
            {/* A signed-out person is on their way to Welcome, not to the chat
                shell — showing its skeleton promises a workspace they do not have
                yet. Same branch app.tsx makes for the boot fallback. */}
            <Suspense fallback={isAuthenticated ? <AppShellSkeleton /> : <LoadingFallback />}>
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
