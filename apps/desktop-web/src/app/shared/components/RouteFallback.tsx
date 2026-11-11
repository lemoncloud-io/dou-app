import { LoadingFallback } from '@chatic/shared';

import { AppShellSkeleton } from './AppShellSkeleton';
import { PageSkeleton } from './PageSkeleton';

interface RouteFallbackProps {
    pathname: string;
    isAuthenticated: boolean;
}

/**
 * What to draw while a route or the boot is suspended. Only the home route renders the chat
 * shell (rails · sidebar · main); every other signed-in route is a full-width page, so it gets
 * `PageSkeleton`. A signed-out person is on the way to Welcome and keeps the plain loader.
 */
export const RouteFallback = ({ pathname, isAuthenticated }: RouteFallbackProps) => {
    if (!isAuthenticated) return <LoadingFallback />;
    return pathname === '/' ? <AppShellSkeleton /> : <PageSkeleton />;
};
