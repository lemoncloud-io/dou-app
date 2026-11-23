import type { ReactNode } from 'react';

import type { NavDestination } from '../../../shared';

interface NavSidebarProps {
    active: NavDestination;
    home: ReactNode;
    notifications: ReactNode;
    channels: ReactNode;
    dm: ReactNode;
}

export const NavSidebar = ({ active, home, notifications, channels, dm }: NavSidebarProps) => {
    const isHome = active === 'home';
    return (
        <>
            <div hidden={!isHome} className={isHome ? 'flex min-h-0 flex-1 flex-col' : undefined}>
                {home}
            </div>
            {active === 'notifications' && notifications}
            {active === 'channels' && channels}
            {active === 'dm' && dm}
        </>
    );
};
