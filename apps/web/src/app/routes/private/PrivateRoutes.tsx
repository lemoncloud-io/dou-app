import { HomeRoutes } from '../../features/home';
import { PointerTestRoutes } from '../../features/pointer-test';
import { ChatRoutes } from '../../features/chats';
import { SafeAreaLayout } from '../../shared/layouts';

export const privateRoutes = [
    {
        path: '/',
        element: <SafeAreaLayout />,

        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'pointer-test/*', element: <PointerTestRoutes /> },
            { path: 'chats/*', element: <ChatRoutes /> },
        ],
    },
];
