import { HomeRoutes } from '../../features/home';
import { PointerTestRoutes } from '../../features/pointer-test';
import { PrivateLayout } from '../../shared/layouts';

export const privateRoutes = [
    {
        path: '/',
        element: <PrivateLayout />,
        children: [
            { index: true, element: <HomeRoutes /> },
            { path: 'pointer-test/*', element: <PointerTestRoutes /> },
        ],
    },
];
