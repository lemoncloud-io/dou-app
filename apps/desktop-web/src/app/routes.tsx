import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';

import { useInviteLoginPageStore } from './features/auth/stores/useInviteLoginPageStore';
import { usePairingCodePageStore } from './features/pairing/stores/usePairingCodePageStore';
import { canRequestPairing, isDevicePairingEnabled } from './features/pairing/utils/devicePairing';
import { selectHeldLogin, useOAuthAttemptStore } from './features/auth/stores/useOAuthAttemptStore';
import { isPhoneLoginEnabled } from './features/auth/utils/phoneLogin';
import { useQuickSwitcherStore } from './features/chat/stores/useQuickSwitcherStore';
import { useShortcutsDialogStore } from './features/chat/stores/useShortcutsDialogStore';
import { useSearchDialogStore } from './features/search/stores/useSearchDialogStore';
import { pressHistory, useHistoryNavigation } from './features/chat/hooks/useHistoryNavigation';
import { RouteFallback, parsePushDeeplink, useDownloadNotices, usePendingOpenStore } from './shared';

const HistoryNavigation = () => {
    useHistoryNavigation();
    return null;
};

const DownloadNotices = () => {
    useDownloadNotices();
    return null;
};

const NotificationOpenListener = () => {
    const navigate = useNavigate();
    const request = usePendingOpenStore(s => s.request);
    const pendingNonce = usePendingOpenStore(s => s.target?.nonce);
    useEffect(() => {
        if (pendingNonce == null) return;
        navigate('/');
    }, [pendingNonce, navigate]);
    useEffect(() => {
        const notifications = runtime.push.notifications;
        if (!notifications) return;
        return notifications.onReceive(({ notification }) => {
            const deeplink: string | undefined = notification?.data?.deeplink;
            if (deeplink === 'chatic-ui:settings') {
                navigate('/settings');
                return;
            }
            if (deeplink === 'chatic-ui:back' || deeplink === 'chatic-ui:forward') {
                pressHistory(deeplink === 'chatic-ui:back' ? 'back' : 'forward');
                return;
            }
            if (deeplink === 'chatic-ui:shortcuts') {
                useShortcutsDialogStore.getState().setOpen(true);
                return;
            }
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

const ShortcutsDialog = lazy(() => import('./features/chat').then(m => ({ default: m.ShortcutsDialog })));
const ShortcutHintBar = lazy(() => import('./features/chat').then(m => ({ default: m.ShortcutHintBar })));
const JoinWithInviteDialog = lazy(() => import('./features/auth').then(m => ({ default: m.JoinWithInviteDialog })));
const AppearanceDialog = lazy(() =>
    import('./features/settings/components/AppearanceDialog').then(m => ({ default: m.AppearanceDialog }))
);
const HomePage = lazy(() => import('./features/chat').then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import('./features/profile').then(m => ({ default: m.ProfilePage })));
const PlaceSettingsPage = lazy(() => import('./features/places').then(m => ({ default: m.PlaceSettingsPage })));
const PlaceChannelsPage = lazy(() => import('./features/places').then(m => ({ default: m.PlaceChannelsPage })));
const AccountHubPage = lazy(() => import('./features/account').then(m => ({ default: m.AccountHubPage })));
const CloudListPage = lazy(() => import('./features/account').then(m => ({ default: m.CloudListPage })));
const CloudHubPage = lazy(() => import('./features/account').then(m => ({ default: m.CloudHubPage })));
const CloudPlacesPage = lazy(() => import('./features/account').then(m => ({ default: m.CloudPlacesPage })));
const PolicyListPage = lazy(() => import('./features/account').then(m => ({ default: m.PolicyListPage })));
const PrivacyPage = lazy(() => import('./features/account').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./features/account').then(m => ({ default: m.TermsPage })));
const SettingsPage = lazy(() => import('./features/settings').then(m => ({ default: m.SettingsPage })));
const WelcomePage = lazy(() => import('./features/auth').then(m => ({ default: m.WelcomePage })));
const InviteLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.InviteLoginPage })));
const DebugLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.DebugLoginPage })));
const PhoneLoginPage = lazy(() => import('./features/auth').then(m => ({ default: m.PhoneLoginPage })));
const OAuthResponsePage = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthResponsePage })));
const OAuthDeeplinkListener = lazy(() => import('./features/auth').then(m => ({ default: m.OAuthDeeplinkListener })));
const SignInNotice = lazy(() => import('./features/auth').then(m => ({ default: m.SignInNotice })));
const PairingCodePage = lazy(() => import('./features/pairing').then(m => ({ default: m.PairingCodePage })));
const PairingApprovePage = lazy(() => import('./features/pairing').then(m => ({ default: m.PairingApprovePage })));
const DevicesPage = lazy(() => import('./features/pairing').then(m => ({ default: m.DevicesPage })));

const LocationFallback = ({ isAuthenticated }: { isAuthenticated: boolean }) => (
    <RouteFallback pathname={useLocation().pathname} isAuthenticated={isAuthenticated} />
);

export const AppRouter = () => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const inviteAttemptHeld = useInviteLoginPageStore(s => s.held);
    const socialLoginHeld = useOAuthAttemptStore(selectHeldLogin);
    const pairingHeld = usePairingCodePageStore(s => s.held);

    return (
        <Router>
            {isAuthenticated && <NotificationOpenListener />}
            {isAuthenticated && <DownloadNotices />}
            {isAuthenticated && <HistoryNavigation />}
            {isAuthenticated && (
                <Suspense fallback={null}>
                    <ShortcutsDialog />
                    <ShortcutHintBar />
                    <JoinWithInviteDialog />
                    <AppearanceDialog />
                </Suspense>
            )}
            <Suspense fallback={<LocationFallback isAuthenticated={isAuthenticated} />}>
                <OAuthDeeplinkListener />
                {isAuthenticated && <SignInNotice />}
                <Routes>
                    {isAuthenticated ? (
                        <>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/places/:placeId/settings" element={<PlaceSettingsPage />} />
                            <Route path="/places/:placeId/channels" element={<PlaceChannelsPage />} />
                            <Route path="/account" element={<AccountHubPage />} />
                            <Route path="/account/clouds" element={<CloudListPage />} />
                            <Route path="/account/clouds/:cloudId" element={<CloudHubPage />} />
                            <Route path="/account/clouds/:cloudId/places" element={<CloudPlacesPage />} />
                            <Route path="/account/policies" element={<PolicyListPage />} />
                            <Route path="/account/policies/terms" element={<TermsPage />} />
                            <Route path="/account/policies/privacy" element={<PrivacyPage />} />
                            {isDevicePairingEnabled() && (
                                <>
                                    <Route path="/settings/pairing/approve" element={<PairingApprovePage />} />
                                    <Route path="/account/devices" element={<DevicesPage />} />
                                </>
                            )}
                            <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                            {inviteAttemptHeld && <Route path="/auth/login" element={<InviteLoginPage />} />}
                            {socialLoginHeld && <Route path="/auth/welcome" element={<WelcomePage />} />}
                            {isPhoneLoginEnabled() && <Route path="/auth/phone" element={<PhoneLoginPage />} />}
                            {pairingHeld && <Route path="/auth/pair" element={<PairingCodePage />} />}
                            <Route path="/auth/*" element={<Navigate to="/" replace />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </>
                    ) : (
                        <>
                            <Route path="/auth/welcome" element={<WelcomePage />} />
                            <Route path="/auth/login" element={<InviteLoginPage />} />
                            {isPhoneLoginEnabled() && <Route path="/auth/phone" element={<PhoneLoginPage />} />}
                            <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                            {canRequestPairing() && <Route path="/auth/pair" element={<PairingCodePage />} />}
                            {import.meta.env.DEV && <Route path="/auth/debug" element={<DebugLoginPage />} />}
                            <Route path="*" element={<Navigate to="/auth/welcome" replace />} />
                        </>
                    )}
                </Routes>
            </Suspense>
        </Router>
    );
};
