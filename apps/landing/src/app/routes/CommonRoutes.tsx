import { DeepLinkRoutes } from '../features/deeplink';
import { HomeRoutes } from '../features/home';
import { PolicyRoutes } from '../features/policy';

export const CommonRoutes = [
    {
        path: 's/*',
        element: <DeepLinkRoutes />,
    },
    {
        // Encoded invite links (`/i?t=…`). Without this they fall to the catch-all below, which
        // redirects to `/` and drops the token, so a browser that did not hand the link to the app
        // shows the marketing page with no way into the invite.
        path: 'i/*',
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
