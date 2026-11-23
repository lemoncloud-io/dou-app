import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';
import {
    FloatingTabBar,
    IconNavBell,
    IconNavBellSolid,
    IconNavChat,
    IconNavChatSolid,
    IconNavMiniApp,
    IconNavMiniAppSolid,
    IconNavMy,
    IconNavMySolid,
} from '@chatic/web-ui-kit';

import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { haptics } from '../../bridge/haptics';
import { ROUTES } from '../../routes/paths';
import { useKeyboardOpen } from '../hooks/useKeyboardOpen';

export const BOTTOM_NAV_TOAST_LIFT = 80;

const isActivePath = (pathname: string, path: string): boolean =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');

export interface BottomNavigationProps {
    unreadTotal?: number;
    hasUnreadNotifications?: boolean;
}

export const BottomNavigation = ({ unreadTotal = 0, hasUnreadNotifications = false }: BottomNavigationProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { pathname } = useLocation();
    const miniAppTab = runtime.settings.useConfigValue<boolean>('feature.miniApp.tab') === true;

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
        ...(miniAppTab
            ? [
                  {
                      key: ROUTES.miniApps.root,
                      label: t('bottomNav.miniApp'),
                      icon: <IconNavMiniApp />,
                      activeIcon: <IconNavMiniAppSolid />,
                      active: isActivePath(pathname, ROUTES.miniApps.root),
                  },
              ]
            : []),
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

    const select = (key: string) => {
        if (!items.find(item => item.key === key)?.active) haptics.play('selection');
        navigate(key, { replace: true });
    };

    return <FloatingTabBar items={items} onSelect={select} />;
};
