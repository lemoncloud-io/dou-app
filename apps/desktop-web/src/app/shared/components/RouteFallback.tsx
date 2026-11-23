import { LoadingFallback } from '@chatic/shared';

import { AppShellSkeleton } from './AppShellSkeleton';
import { PageSkeleton } from './PageSkeleton';

interface RouteFallbackProps {
    pathname: string;
    isAuthenticated: boolean;
}

export const RouteFallback = ({ pathname, isAuthenticated }: RouteFallbackProps) => {
    if (!isAuthenticated) return <LoadingFallback />;
    return pathname === '/' ? <AppShellSkeleton /> : <PageSkeleton />;
};
