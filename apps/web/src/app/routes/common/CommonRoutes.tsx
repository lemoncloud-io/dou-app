import { AuthTestRoutes } from '../../features/auth-test';
import { DeeplinkTestRoutes } from '../../features/deeplink-test';

export const commonRoutes = [
    { path: '/auth-test/*', element: <AuthTestRoutes /> },
    { path: '/users/*', element: <DeeplinkTestRoutes /> },
];
