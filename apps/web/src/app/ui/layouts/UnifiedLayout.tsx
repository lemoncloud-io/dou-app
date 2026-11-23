import type { JSX } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { runtime } from '@chatic/runtime';
import { cn } from '@chatic/ui-kit';

import { useHandlePushNavigation } from '../../bridge';
import {
    useActiveCloudUnreads,
    useBackHandler,
    useScopedNotifications,
    useDeviceSync,
    useInAppPushMessage,
    useOpenPendingInviteChannel,
} from '../../hooks';
import { ROUTES } from '../../routes/paths';
import { useBottomNavSuppression } from '../../stores/useBottomNavSuppression';
import { hasUnreadInScope } from '../../utils/notifications';
import { BottomNavigation } from '../components';

const MAIN_VARIANT_PATHS = ['/'];

const isMainVariant = (pathname: string): boolean =>
    MAIN_VARIANT_PATHS.some(path =>
        path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')
    );

const BOTTOM_NAV_PATHS: string[] = [ROUTES.home, ROUTES.notifications, ROUTES.mypage.root];

const shouldShowBottomNav = (pathname: string, miniAppTab: boolean): boolean =>
    BOTTOM_NAV_PATHS.includes(pathname) || (miniAppTab && pathname === ROUTES.miniApps.root);

export const UnifiedLayout = (): JSX.Element => {
    useBackHandler();
    useDeviceSync();
    useHandlePushNavigation();
    useInAppPushMessage();
    useOpenPendingInviteChannel();

    const { pathname } = useLocation();
    const isMain = isMainVariant(pathname);

    const isNavSuppressed = useBottomNavSuppression(state => state.suppressed);
    const miniAppTab = runtime.settings.useConfigValue<boolean>('feature.miniApp.tab') === true;
    const showBottomNav = shouldShowBottomNav(pathname, miniAppTab) && !isNavSuppressed;
    const { total: unreadTotal } = useActiveCloudUnreads();
    const hasUnreadNotifications = hasUnreadInScope(useScopedNotifications());

    return (
        <div
            className={cn(
                'flex flex-col w-full max-w-app mx-auto bg-background',
                isMain ? 'min-h-dvh text-foreground relative overflow-x-hidden' : 'h-dvh overflow-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
            {showBottomNav && (
                <BottomNavigation unreadTotal={unreadTotal} hasUnreadNotifications={hasUnreadNotifications} />
            )}
        </div>
    );
};
