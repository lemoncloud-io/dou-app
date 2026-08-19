import type { JSX } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { useHandlePushNavigation } from '../../bridge';
import { useActiveCloudUnreads, useBackHandler, useDeviceSync, useInAppPushMessage } from '../../hooks';
import { ROUTES } from '../../routes/paths';
import { BottomNavigation } from '../components';

const MAIN_VARIANT_PATHS = ['/'];

const isMainVariant = (pathname: string): boolean =>
    MAIN_VARIANT_PATHS.some(path =>
        path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')
    );

// Main tab destinations that surface the floating bottom nav. Detail/edit/room
// screens are intentionally absent — the nav hides there. Exact match only.
const BOTTOM_NAV_PATHS: string[] = [ROUTES.home, ROUTES.mypage.root];

const shouldShowBottomNav = (pathname: string): boolean => BOTTOM_NAV_PATHS.includes(pathname);

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

    // Own the bottom-nav unread badge here (the layout that renders the nav), rather than inside
    // the nav component. The native app-icon badge is a separate concern owned by UnreadBadgeRunner.
    const showBottomNav = shouldShowBottomNav(pathname);
    // A read of the app-wide shared observation, not a subscription. This layout wraps EVERY route,
    // so the cloud-wide channel + per-channel join observers it used to open here made any join
    // write in the cloud re-render the shell — from inside a chat room, for a badge that only shows
    // on home and mypage. Ownership now sits in ActiveCloudDataProvider (see ActiveCloudData).
    const { total: unreadTotal } = useActiveCloudUnreads();

    return (
        <div
            className={cn(
                // `w-full max-w-app mx-auto` on BOTH branches: every screen here is laid out for a
                // phone-sized WebView, so on anything wider it caps and centres instead of
                // stretching. The detail branch used to have no cap at all, which left routes like
                // the chat room spanning a desktop browser — the one place `apps/web` is reachable
                // outside the shell (invite and share links land there).
                'flex flex-col w-full max-w-app mx-auto bg-background',
                isMain ? 'min-h-dvh text-foreground relative overflow-x-hidden' : 'h-dvh overflow-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
            {/* The floating bottom nav is owned by the shell and shown only on main
                tab destinations; pages no longer render it themselves. */}
            {showBottomNav && <BottomNavigation unreadTotal={unreadTotal} />}
        </div>
    );
};
