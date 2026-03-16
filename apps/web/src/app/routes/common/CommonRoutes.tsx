import { AuthRoutes } from '../../features/auth';

export const commonRoutes = [{ path: '/auth/*', element: <AuthRoutes /> }];
