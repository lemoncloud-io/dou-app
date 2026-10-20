import type { ReactNode } from 'react';

import type { NavDestination } from '../../../shared';

interface NavSidebarProps {
    active: NavDestination;
    /** The Home sidebar: the place's header and channel list. */
    home: ReactNode;
    notifications: ReactNode;
    channels: ReactNode;
}

/**
 * The sidebar column for the open nav destination.
 *
 * Home stays mounted, hidden, while another destination is open. Its channel list writes the order
 * the next-unread shortcut walks and holds the quick switcher and message search; unmounted, the
 * shortcut would walk an order frozen at the last Home render and ⌘K would stop answering.
 */
export const NavSidebar = ({ active, home, notifications, channels }: NavSidebarProps) => {
    const isHome = active === 'home';
    return (
        <>
            <div hidden={!isHome} className={isHome ? 'flex min-h-0 flex-1 flex-col' : undefined}>
                {home}
            </div>
            {active === 'notifications' && notifications}
            {active === 'channels' && channels}
        </>
    );
};
