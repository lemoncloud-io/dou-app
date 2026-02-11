import { HomeRoutes } from '../../features/home';
import { PointerTestRoutes } from '../../features/pointer-test';

export const privateRoutes = [
    {
        path: '/',
        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'pointer-test/*', element: <PointerTestRoutes /> },
        ],
    },
];
