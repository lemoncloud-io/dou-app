import { lazy, Suspense } from 'react';

import { HomeRoutes } from '../features/home';
import { UnifiedLayout } from '../ui/layouts';
import { InviteEntryGate } from './InviteEntryGate';

const ChannelRoutes = lazy(() => import('../features/channels').then(m => ({ default: m.ChannelRoutes })));
const MyPageRoutes = lazy(() => import('../features/mypage').then(m => ({ default: m.MyPageRoutes })));
const SubscriptionRoutes = lazy(() =>
    import('../features/subscription').then(m => ({ default: m.SubscriptionRoutes }))
);
const AddCloudFlowHost = lazy(() => import('../features/subscription').then(m => ({ default: m.AddCloudFlowHost })));
const AccountRoutes = lazy(() => import('../features/account').then(m => ({ default: m.AccountRoutes })));
const PlaceRoutes = lazy(() => import('../features/place').then(m => ({ default: m.PlaceRoutes })));
const InviteRoutes = lazy(() => import('../features/invite').then(m => ({ default: m.InviteRoutes })));
const SearchRoutes = lazy(() => import('../features/search').then(m => ({ default: m.SearchRoutes })));
const OnboardingRoutes = lazy(() => import('../features/onboarding').then(m => ({ default: m.OnboardingRoutes })));

const RouteFallback = () => (
    <div className="flex h-full flex-col bg-background px-5 pt-safe-top">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 py-4">
            <div className="h-5 w-5 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        </div>
        {/* Content skeleton */}
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

const withSuspense = (Component: React.ComponentType) => (
    <Suspense fallback={<RouteFallback />}>
        <Component />
    </Suspense>
);

/**
 * The private shell plus the flows the router composes on top of it.
 *
 * `AddCloudFlowHost` is mounted here rather than in `AppRuntime` because it navigates (a guest is
 * sent to login) and therefore needs router context; and it is composed here rather than imported
 * by home because features do not import each other (ADR-0046 §3). It renders nothing — and runs no
 * queries — until something raises a request through `stores/useAddCloudRequest`.
 */
const PrivateShell = () => (
    <>
        <UnifiedLayout />
        <Suspense fallback={null}>
            <AddCloudFlowHost />
        </Suspense>
    </>
);

export const privateRoutes = [
    {
        path: '/',
        element: <PrivateShell />,
        children: [
            // The gate forwards an invite landing to `/invite/accept` instead of rendering home —
            // `/?provider=invite&…` is the address every already-installed native app still builds.
            {
                index: true,
                element: (
                    <InviteEntryGate>
                        <HomeRoutes />
                    </InviteEntryGate>
                ),
            },
            { path: 'mypage/*', element: withSuspense(MyPageRoutes) },
            { path: 'subscription/*', element: withSuspense(SubscriptionRoutes) },
            { path: 'account/*', element: withSuspense(AccountRoutes) },
            { path: 'channels/*', element: withSuspense(ChannelRoutes) },
            { path: 'place/*', element: withSuspense(PlaceRoutes) },
            { path: 'invite/*', element: withSuspense(InviteRoutes) },
            { path: 'search/*', element: withSuspense(SearchRoutes) },
            { path: 'onboarding/*', element: withSuspense(OnboardingRoutes) },
        ],
    },
];
