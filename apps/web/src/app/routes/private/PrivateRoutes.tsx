import { HomeRoutes } from '../../features/home';
import { PointerTestRoutes } from '../../features/pointer-test';
import { ChatRoutes } from '../../features/chats';

export const privateRoutes = [
    {
        path: '/',
        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'pointer-test/*', element: <PointerTestRoutes /> },
            { path: 'chats/*', element: <ChatRoutes /> },
        ],
    },
];
