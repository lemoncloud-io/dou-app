import { DeepLinkRoutes } from '../features/deeplink';
import { HomeRoutes } from '../features/home';
import { PolicyRoutes } from '../features/policy';

export const CommonRoutes = [
    {
        path: 's/*',
        element: <DeepLinkRoutes />,
    },
    {
        path: 'policy/*',
        element: <PolicyRoutes />,
    },
    {
        path: '*',
        element: <HomeRoutes />,
    },
];
