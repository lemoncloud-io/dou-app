import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';
import {
    FloatingTabBar,
    IconNavBell,
    IconNavBellSolid,
    IconNavChat,
    IconNavChatSolid,
    IconNavMy,
    IconNavMySolid,
} from '@chatic/web-ui-kit';

import { useNavigateWithTransition } from '@chatic/shared';
import { haptics } from '../../bridge/haptics';
import { ROUTES } from '../../routes/paths';
import { useKeyboardOpen } from '../hooks/useKeyboardOpen';

/**
 * The floating tab bar's height above the bottom inset: a 62px pill on an 18px offset. While the
 * bar is on screen, the snackbar rests this much higher so it lands above the bar instead of over
 * the tabs. The toaster is mounted above the router and cannot tell which screen is showing, so the
 * bar announces itself through `useToastLift`.
 */
export const BOTTOM_NAV_TOAST_LIFT = 80;

const isActivePath = (pathname: string, path: string): boolean =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');

export interface BottomNavigationProps {
    /** Chat-tab unread count. Owned by the layout that renders the nav (UnifiedLayout). */
    unreadTotal?: number;
    /** The notifications tab's dot — an unread notification where the session is. Also the layout's. */
    hasUnreadNotifications?: boolean;
}

/**
 * App bottom navigation — the routing adapter around the design-system
 * FloatingTabBar. Owns the 3-tab set (Chat / Notifications / My) and route-based active state;
 * the unread count is supplied by the layout, and the visual/floating/safe-area
 * concerns live in the kit component. Rendered once by UnifiedLayout (not per page).
 */
export const BottomNavigation = ({ unreadTotal = 0, hasUnreadNotifications = false }: BottomNavigationProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { pathname } = useLocation();

    // The WebView does not shrink under the keyboard, so the bar is behind it then and lifts
    // nothing — the snackbar already rides on the keyboard height.
    useToastLift(useKeyboardOpen() ? null : BOTTOM_NAV_TOAST_LIFT);

    const items = [
        {
            key: ROUTES.home,
            label: t('bottomNav.chat'),
            icon: <IconNavChat />,
            activeIcon: <IconNavChatSolid />,
            badge: unreadTotal,
            badgeLabel: unreadTotal > 0 ? t('bottomNav.unread', { count: unreadTotal }) : undefined,
            active: isActivePath(pathname, ROUTES.home),
        },
        {
            key: ROUTES.notifications,
            label: t('bottomNav.notifications'),
            icon: <IconNavBell />,
            activeIcon: <IconNavBellSolid />,
            dot: hasUnreadNotifications,
            dotLabel: hasUnreadNotifications ? t('bottomNav.newNotifications') : undefined,
            active: isActivePath(pathname, ROUTES.notifications),
        },
        {
            key: ROUTES.mypage.root,
            label: t('bottomNav.my'),
            icon: <IconNavMy />,
            activeIcon: <IconNavMySolid />,
            active: isActivePath(pathname, ROUTES.mypage.root),
        },
    ];

    // A tick as the bar snaps to another tab; re-tapping the tab already open plays nothing.
    const select = (key: string) => {
        if (!items.find(item => item.key === key)?.active) haptics.play('selection');
        navigate(key, { replace: true });
    };

    return <FloatingTabBar items={items} onSelect={select} />;
};
