import type { LucideIcon } from 'lucide-react';
import { Bell, Hash, House, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { type NavDestination, RailTile, useNavStore } from '../../../shared';
import { AccountMenu } from './AccountMenu';

const ICONS: Record<NavDestination, LucideIcon> = {
    home: House,
    notifications: Bell,
    channels: Hash,
    dm: MessageCircle,
};

interface NavRailProps {
    /** The destinations to draw, in order. A destination is listed once its screen exists. */
    items: NavDestination[];
    /** Destinations holding something unread; each gets a dot on its tile. */
    unread?: Partial<Record<NavDestination, boolean>>;
    /** The open place. Its logo stands in for Home's glyph, so the rail says which place it is in. */
    place?: { thumbnail?: string };
    /**
     * Actions drawn under the destinations, as rail tiles (`RailTile`). They open something over the app
     * rather than swap the sidebar, so they are never the open destination.
     */
    extra?: ReactNode;
}

/**
 * The second rail: where in the active place the sidebar column looks — Home, Notifications,
 * Channels or DM — then any extra actions, with the account menu pinned under them. Picking a
 * destination swaps the sidebar and leaves the open conversation where it is.
 */
export const NavRail = ({ items, unread = {}, place, extra }: NavRailProps) => {
    const { t } = useTranslation();
    const active = useNavStore(s => s.active);
    const go = useNavStore(s => s.go);

    return (
        <div className="flex h-full w-full flex-col items-center">
            <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-auto scrollbar-hide pt-0.5">
                {items.map(destination => {
                    const Icon = ICONS[destination];
                    const label = t(`nav.${destination}`);
                    const isActive = destination === active;
                    const hasUnread = !!unread[destination];
                    return (
                        <RailTile
                            key={destination}
                            label={label}
                            accessibleName={hasUnread ? t('nav.unread', { name: label }) : label}
                            active={isActive}
                            dot={hasUnread}
                            onClick={() => go(destination)}
                        >
                            {destination === 'home' && place?.thumbnail ? (
                                <img src={place.thumbnail} alt="" className="h-7 w-7 rounded-lg object-cover" />
                            ) : (
                                <Icon size={20} strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                            )}
                        </RailTile>
                    );
                })}
                {extra}
            </div>
            <AccountMenu />
        </div>
    );
};
