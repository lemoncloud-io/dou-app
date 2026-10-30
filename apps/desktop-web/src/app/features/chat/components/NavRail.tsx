import type { LucideIcon } from 'lucide-react';
import { Bell, Hash, House, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { type NavDestination, useNavStore } from '../../../shared';
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
}

/**
 * The second rail: where in the active place the sidebar column looks — Home, Notifications,
 * Channels or DM — with the account menu pinned under them. Picking a destination swaps the
 * sidebar and leaves the open conversation where it is.
 */
export const NavRail = ({ items, unread = {} }: NavRailProps) => {
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
                        <button
                            key={destination}
                            type="button"
                            onClick={() => go(destination)}
                            aria-label={hasUnread ? t('nav.unread', { name: label }) : label}
                            aria-current={isActive ? 'page' : undefined}
                            className="group flex flex-col items-center gap-1 rounded-lg focus-ring"
                        >
                            <span
                                className={cn(
                                    'relative flex h-11 w-11 items-center justify-center rounded-xl text-rail-foreground transition-colors duration-150 ease-tactile tactile',
                                    // Light mode takes the palette's tile; dark mode keeps its lime tint.
                                    isActive
                                        ? 'bg-rail-active text-rail-active-foreground dark:bg-primary/[0.24] dark:text-rail-foreground'
                                        : 'group-hover:bg-accent'
                                )}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                                {hasUnread && (
                                    <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-badge-unread" />
                                )}
                            </span>
                            <span
                                aria-hidden
                                className={cn(
                                    'text-micro leading-tight',
                                    isActive ? 'font-bold text-foreground' : 'font-medium text-rail-foreground'
                                )}
                            >
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
            <AccountMenu />
        </div>
    );
};
