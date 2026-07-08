import type { JSX } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { useHandlePushNavigation } from '../../bridge';
import { useInAppPushMessage } from '../../features/notifications';
import { useBackHandler, useDeviceSync } from '../../hooks';

const MAIN_VARIANT_PATHS = ['/'];

const isMainVariant = (pathname: string): boolean =>
    MAIN_VARIANT_PATHS.some(path =>
        path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')
    );

export const UnifiedLayout = (): JSX.Element => {
    useBackHandler();
    // Notify the device's viewing target from the current route (channel room → clear elsewhere).
    useDeviceSync();
    // Handle native-driven navigation (push taps / deep links), incl. cross-cloud/site switches.
    useHandlePushNavigation();
    // Surface foreground pushes as an in-app banner; a click routes like a push tap.
    useInAppPushMessage();

    const { pathname } = useLocation();
    const isMain = isMainVariant(pathname);

    return (
        <div
            className={cn(
                'flex flex-col w-full bg-background',
                isMain
                    ? 'max-w-[430px] mx-auto min-h-dvh text-foreground relative overflow-x-hidden'
                    : 'h-dvh overflow-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
