import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { FloatingTabBar } from '@chatic/web-ui-kit';

import { useNavigateWithTransition } from '@chatic/shared';
import { ROUTES } from '../../routes/paths';

const IconChat = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.49994 2.22012C10.1802 2.07387 10.8741 2.00013 11.5699 2.00012C14.3518 1.98651 17.0031 3.17908 18.8385 5.26958C20.6739 7.36009 21.5134 10.1434 21.1399 12.9001C20.5399 17.5001 15.9999 21.2201 11.3599 21.2201H4.69994C4.13381 21.2204 3.60916 20.9232 3.31819 20.4376C3.02722 19.952 3.0127 19.3492 3.27994 18.8501L3.54994 18.3301C3.81866 17.8293 3.79959 17.2231 3.49994 16.7401C1.82164 14.1017 1.53349 10.8113 2.72768 7.92133C3.92187 5.0314 6.44873 2.90416 9.49994 2.22012ZM11.2799 19.7101C15.3566 19.6458 18.8235 16.7184 19.5699 12.7101C19.909 10.3872 19.2106 8.03257 17.6599 6.27011C16.1239 4.51239 13.9042 3.50279 11.5699 3.50012C10.9787 3.50124 10.3891 3.56155 9.80993 3.68012C7.23508 4.25302 5.09972 6.04239 4.08517 8.4773C3.07063 10.9122 3.30366 13.6884 4.70993 15.9201C5.30823 16.86 5.35032 18.0503 4.81993 19.0301L4.54993 19.5401C4.52795 19.5735 4.52795 19.6167 4.54993 19.6501C4.58993 19.7101 4.64993 19.7101 4.64993 19.7101H11.2799Z"
            fill="currentColor"
        />
    </svg>
);

const IconMy = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M16.6406 22H7.36058C6.34976 21.9633 5.40815 21.477 4.79293 20.6742C4.17771 19.8713 3.95315 18.8356 4.18058 17.85L4.42058 16.71C4.69662 15.1668 6.0232 14.0327 7.59058 14H16.4106C17.978 14.0327 19.3045 15.1668 19.5806 16.71L19.8206 17.85C20.048 18.8356 19.8235 19.8713 19.2082 20.6742C18.593 21.477 17.6514 21.9633 16.6406 22Z"
            fill="currentColor"
        />
        <path
            d="M12.5006 12H11.5006C9.29144 12 7.50058 10.2092 7.50058 8.00001V5.36001C7.49792 4.46807 7.85106 3.61189 8.48176 2.98119C9.11246 2.35049 9.96864 1.99735 10.8606 2.00001H13.1406C14.0325 1.99735 14.8887 2.35049 15.5194 2.98119C16.1501 3.61189 16.5033 4.46807 16.5006 5.36001V8.00001C16.5006 9.06088 16.0792 10.0783 15.329 10.8284C14.5789 11.5786 13.5614 12 12.5006 12Z"
            fill="currentColor"
        />
    </svg>
);

const isActivePath = (pathname: string, path: string): boolean =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');

export interface BottomNavigationProps {
    /** Chat-tab unread count. Owned by the layout that renders the nav (UnifiedLayout). */
    unreadTotal?: number;
}

/**
 * App bottom navigation — the routing adapter around the design-system
 * FloatingTabBar. Owns the 2-tab set (Chat / My) and route-based active state;
 * the unread count is supplied by the layout, and the visual/floating/safe-area
 * concerns live in the kit component. Rendered once by UnifiedLayout (not per page).
 */
export const BottomNavigation = ({ unreadTotal = 0 }: BottomNavigationProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { pathname } = useLocation();

    const items = [
        {
            key: ROUTES.home,
            label: t('bottomNav.chat'),
            icon: <IconChat />,
            badge: unreadTotal,
            badgeLabel: unreadTotal > 0 ? t('bottomNav.unread', { count: unreadTotal }) : undefined,
            active: isActivePath(pathname, ROUTES.home),
        },
        {
            key: ROUTES.mypage.root,
            label: t('bottomNav.my'),
            icon: <IconMy />,
            active: isActivePath(pathname, ROUTES.mypage.root),
        },
    ];

    return <FloatingTabBar items={items} onSelect={key => navigate(key, { replace: true })} />;
};
