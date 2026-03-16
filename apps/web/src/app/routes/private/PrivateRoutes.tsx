import { ChatRoutes } from '../../features/chats';
import { ExploreRoutes } from '../../features/explore';
import { CreateRoomRoutes, HomeRoutes } from '../../features/home';
import { JoinRoutes } from '../../features/join';
import { MyPageRoutes } from '../../features/mypage';
import { NotificationsRoutes } from '../../features/notifications';
import { PlaceRoutes } from '../../features/places';
import { CreateWorkspaceRoutes, WorkspaceListRoutes, WorkspaceRoutes } from '../../features/workspace';
import { MainLayout, SafeAreaLayout } from '../../shared/layouts';

export const privateRoutes = [
    // Routes with MainLayout (mobile-first 430px container)
    {
        path: '/',
        element: <MainLayout />,
        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'explore/*', element: <ExploreRoutes /> },
            { path: 'mypage/*', element: <MyPageRoutes /> },
            { path: 'workspace-list/*', element: <WorkspaceListRoutes /> },
        ],
    },
    // Routes with SafeAreaLayout
    {
        path: '/',
        element: <SafeAreaLayout />,
        children: [
            { path: 'mypage/*', element: <MyPageRoutes /> },
            { path: 'chats/*', element: <ChatRoutes /> },
            { path: 'workspace/*', element: <WorkspaceRoutes /> },
            { path: 'create-workspace/*', element: <CreateWorkspaceRoutes /> },
            { path: 'notifications/*', element: <NotificationsRoutes /> },
            { path: 'join/*', element: <JoinRoutes /> },
            { path: 'create-room/*', element: <CreateRoomRoutes /> },
            { path: 'places/*', element: <PlaceRoutes /> },
        ],
    },
];
