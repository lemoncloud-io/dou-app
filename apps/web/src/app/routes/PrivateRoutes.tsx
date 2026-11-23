import { lazy, Suspense } from 'react';

import { HomeRoutes } from '../features/home';
import { PlaceDeletedNotice } from '../features/place/components/PlaceDeletedNotice';
import { UnifiedLayout } from '../ui/layouts';
import { InviteEntryGate } from './InviteEntryGate';
import { useBootSplashHold } from '../runtime/bootSplash';
import { loadChannelRoutes, usePreloadOnIdle } from './routeChunks';

const ChannelRoutes = lazy(() => loadChannelRoutes().then(m => ({ default: m.ChannelRoutes })));
const MyPageRoutes = lazy(() => import('../features/mypage').then(m => ({ default: m.MyPageRoutes })));
const SubscriptionRoutes = lazy(() =>
    import('../features/subscription').then(m => ({ default: m.SubscriptionRoutes }))
);
const AddCloudFlowHost = lazy(() => import('../features/subscription').then(m => ({ default: m.AddCloudFlowHost })));
const EmailBindRequestHost = lazy(() =>
    import('../features/subscription').then(m => ({ default: m.EmailBindRequestHost }))
);
const AccountRoutes = lazy(() => import('../features/account').then(m => ({ default: m.AccountRoutes })));
const PlaceRoutes = lazy(() => import('../features/place').then(m => ({ default: m.PlaceRoutes })));
const InviteRoutes = lazy(() => import('../features/invite').then(m => ({ default: m.InviteRoutes })));
const SearchRoutes = lazy(() => import('../features/search').then(m => ({ default: m.SearchRoutes })));
const OnboardingRoutes = lazy(() => import('../features/onboarding').then(m => ({ default: m.OnboardingRoutes })));
const PairingCodePage = lazy(() => import('../features/pairing').then(m => ({ default: m.PairingCodePage })));
const PairingApprovePage = lazy(() => import('../features/pairing').then(m => ({ default: m.PairingApprovePage })));
const PairingDevicesPage = lazy(() => import('../features/pairing').then(m => ({ default: m.PairingDevicesPage })));
const ShareRoutes = lazy(() => import('../features/share').then(m => ({ default: m.ShareRoutes })));
const NotificationRoutes = lazy(() =>
    import('../features/notifications').then(m => ({ default: m.NotificationRoutes }))
);
const MiniAppRoutes = lazy(() => import('../features/miniapps').then(m => ({ default: m.MiniAppRoutes })));
const FindMeSheetHost = lazy(() => import('../features/notifications').then(m => ({ default: m.FindMeSheetHost })));

const RouteFallback = () => {
    useBootSplashHold();
    return (
        <div className="flex h-full flex-col bg-background px-5 pt-safe-top">
            <div className="flex items-center gap-3 py-4">
                <div className="h-5 w-5 animate-pulse rounded bg-muted" />
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex flex-col gap-4 pt-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="mt-2 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                    </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const withSuspense = (Component: React.ComponentType) => (
    <Suspense fallback={<RouteFallback />}>
        <Component />
    </Suspense>
);

const PrivateShell = () => {
    usePreloadOnIdle(loadChannelRoutes);
    return (
        <>
            <UnifiedLayout />
            <PlaceDeletedNotice />
            <Suspense fallback={null}>
                <AddCloudFlowHost />
                <EmailBindRequestHost />
                <FindMeSheetHost />
            </Suspense>
        </>
    );
};

export const privateRoutes = [
    {
        path: '/',
        element: <PrivateShell />,
        children: [
            {
                index: true,
                element: (
                    <InviteEntryGate>
                        <HomeRoutes />
                    </InviteEntryGate>
                ),
            },
            { path: 'mypage/login/pair', element: withSuspense(PairingCodePage) },
            { path: 'mypage/pairing/approve', element: withSuspense(PairingApprovePage) },
            { path: 'mypage/devices', element: withSuspense(PairingDevicesPage) },
            { path: 'mypage/*', element: withSuspense(MyPageRoutes) },
            { path: 'subscription/*', element: withSuspense(SubscriptionRoutes) },
            { path: 'account/*', element: withSuspense(AccountRoutes) },
            { path: 'channels/*', element: withSuspense(ChannelRoutes) },
            { path: 'place/*', element: withSuspense(PlaceRoutes) },
            { path: 'invite/*', element: withSuspense(InviteRoutes) },
            { path: 'search/*', element: withSuspense(SearchRoutes) },
            { path: 'notifications/*', element: withSuspense(NotificationRoutes) },
            { path: 'miniapps/*', element: withSuspense(MiniAppRoutes) },
            { path: 'onboarding/*', element: withSuspense(OnboardingRoutes) },
            { path: 'share/*', element: withSuspense(ShareRoutes) },
        ],
    },
];
