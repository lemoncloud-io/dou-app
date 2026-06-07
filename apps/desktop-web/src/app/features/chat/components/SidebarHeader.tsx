import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Search } from 'lucide-react';

import type { DomainSite } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { Skeleton } from '../../../shared';

interface SidebarHeaderProps {
    places: DomainSite[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    isLoading: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onSelectPlace: (placeId: string) => void;
    onCreateChannel: () => void;
}

const placeName = (place: DomainSite | undefined): string => place?.name ?? place?.id ?? '';

/**
 * Sidebar top: the active place as a dropdown (workspace switcher within the
 * cloud), a channel search box, and the channel-section label with a create
 * action. Place rows carry unread badges sourced from usePlaceUnreadCounts.
 */
export const SidebarHeader = ({
    places,
    selectedPlaceId,
    unreadByPlace,
    isLoading,
    query,
    onQueryChange,
    onSelectPlace,
    onCreateChannel,
}: SidebarHeaderProps) => {
    const { t } = useTranslation();
    const current = places.find(p => p.id === selectedPlaceId);
    const showPlaceSkeleton = isLoading && !current;
    const searchRef = useRef<HTMLInputElement>(null);

    // ⌘K / Ctrl+K focuses the channel search from anywhere in the app.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <div className="flex flex-col gap-2 border-b border-border/60 px-3 pb-3 pt-3">
            <DropdownMenu>
                <DropdownMenuTrigger
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    disabled={places.length === 0}
                >
                    {showPlaceSkeleton ? (
                        <Skeleton className="h-5 w-28" />
                    ) : (
                        <span className="truncate text-base font-bold text-sidebar-foreground">
                            {placeName(current) || t('place.none')}
                        </span>
                    )}
                    <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path
                            d="M4 6l4 4 4-4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                    {places.map(place => {
                        const unread = unreadByPlace[place.id] ?? 0;
                        const isActive = place.id === selectedPlaceId;
                        return (
                            <DropdownMenuItem
                                key={place.id}
                                onClick={() => onSelectPlace(place.id)}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className={cn('truncate', isActive && 'font-semibold')}>{placeName(place)}</span>
                                {unread > 0 && (
                                    <span className="ml-auto rounded-full bg-badge-unread px-1.5 text-[11px] font-semibold tabular-nums text-badge-unread-foreground">
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative">
                <Search
                    size={16}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    ref={searchRef}
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                    placeholder={t('sidebar.search')}
                    className="h-8 bg-background pl-8 text-sm"
                />
            </div>

            <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('sidebar.channels')}
                </span>
                <button
                    onClick={onCreateChannel}
                    title={t('rail.addChannel')}
                    className="flex h-5 w-5 items-center justify-center rounded text-base leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    +
                </button>
            </div>
        </div>
    );
};
