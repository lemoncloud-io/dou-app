import { lazy, Suspense } from 'react';

import { HomeRoutes } from '../../features/home';
import { UnifiedLayout } from '../../shared/layouts';

const ChatRoutes = lazy(() => import('../../features/chats').then(m => ({ default: m.ChatRoutes })));
const ExploreRoutes = lazy(() => import('../../features/explore').then(m => ({ default: m.ExploreRoutes })));
const CreateRoomRoutes = lazy(() => import('../../features/home').then(m => ({ default: m.CreateRoomRoutes })));
const MyPageRoutes = lazy(() => import('../../features/mypage').then(m => ({ default: m.MyPageRoutes })));
const AccountRoutes = lazy(() => import('../../features/account').then(m => ({ default: m.AccountRoutes })));
const WorkspaceRoutes = lazy(() => import('../../features/workspace').then(m => ({ default: m.WorkspaceRoutes })));
const CreateWorkspaceRoutes = lazy(() =>
    import('../../features/workspace').then(m => ({ default: m.CreateWorkspaceRoutes }))
);
const NotificationsRoutes = lazy(() =>
    import('../../features/notifications').then(m => ({ default: m.NotificationsRoutes }))
);
const JoinRoutes = lazy(() => import('../../features/join').then(m => ({ default: m.JoinRoutes })));
const PlaceRoutes = lazy(() => import('../../features/places').then(m => ({ default: m.PlaceRoutes })));

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

export const privateRoutes = [
    {
        path: '/',
        element: <UnifiedLayout />,
        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'explore/*', element: withSuspense(ExploreRoutes) },
            { path: 'mypage/*', element: withSuspense(MyPageRoutes) },
            { path: 'account/*', element: withSuspense(AccountRoutes) },
            { path: 'chats/*', element: withSuspense(ChatRoutes) },
            { path: 'workspace/*', element: withSuspense(WorkspaceRoutes) },
            { path: 'create-workspace/*', element: withSuspense(CreateWorkspaceRoutes) },
            { path: 'notifications/*', element: withSuspense(NotificationsRoutes) },
            { path: 'join/*', element: withSuspense(JoinRoutes) },
            { path: 'create-room/*', element: withSuspense(CreateRoomRoutes) },
            { path: 'places/*', element: withSuspense(PlaceRoutes) },
        ],
    },
];
