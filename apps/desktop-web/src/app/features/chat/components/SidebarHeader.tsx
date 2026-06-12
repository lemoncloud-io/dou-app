import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, ChevronDown, Plus, Search, UserPen } from 'lucide-react';

import type { DomainSite } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { Skeleton } from '../../../shared';

interface SidebarHeaderProps {
    places: DomainSite[];
    selectedPlaceId: string | null;
    unreadByPlace: Record<string, number>;
    isLoading: boolean;
    /** Default Cloud (Guest Session): no places to switch — show a static label. */
    isDefaultMode: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onSelectPlace: (placeId: string) => void;
    onCreateChannel: () => void;
    /** Open the place-profile editor for the active place (per-place identity lives here). */
    onEditPlaceProfile: () => void;
    /** Open the device-local Saved-items trailing pane. */
    onOpenSaved: () => void;
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
    isDefaultMode,
    query,
    onQueryChange,
    onSelectPlace,
    onCreateChannel,
    onEditPlaceProfile,
    onOpenSaved,
}: SidebarHeaderProps) => {
    const { t } = useTranslation();
    const current = places.find(p => p.id === selectedPlaceId);
    const showPlaceSkeleton = isLoading && !current;
    // The active place's unread is already visible in the channel list below —
    // surface only OTHER places' unread on the closed trigger, so a message in
    // another place is noticeable without opening the dropdown.
    const otherPlacesUnread = places.reduce(
        (sum, place) => (place.id === selectedPlaceId ? sum : sum + (unreadByPlace[place.id] ?? 0)),
        0
    );
    // ⌘K now opens the QuickSwitcher (see QuickSwitcher.tsx); the inline filter
    // below stays click-to-use.
    const searchRef = useRef<HTMLInputElement>(null);

    return (
        <div className="flex flex-col gap-2.5 border-b border-hairline px-3 pb-3 pt-3">
            {isDefaultMode ? (
                <span className="truncate px-2 py-1.5 text-title text-sidebar-foreground">{t('place.home')}</span>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        className="focus-ring tactile flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ease-tactile hover:bg-accent disabled:opacity-50"
                        disabled={places.length === 0}
                    >
                        {showPlaceSkeleton ? (
                            <Skeleton className="h-5 w-28" />
                        ) : (
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-title text-sidebar-foreground">
                                    {placeName(current) || t('place.none')}
                                </span>
                                {otherPlacesUnread > 0 && (
                                    <span
                                        className="shrink-0 rounded-full bg-badge-unread px-1.5 text-caption font-semibold tabular-nums text-badge-unread-foreground"
                                        title={t('place.otherUnread')}
                                    >
                                        {otherPlacesUnread > 99 ? '99+' : otherPlacesUnread}
                                    </span>
                                )}
                            </span>
                        )}
                        <ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden />
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
                                    <span className={cn('truncate', isActive && 'font-semibold')}>
                                        {placeName(place)}
                                    </span>
                                    {unread > 0 && (
                                        <span className="ml-auto rounded-full bg-badge-unread px-1.5 text-caption font-semibold tabular-nums text-badge-unread-foreground">
                                            {unread > 99 ? '99+' : unread}
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onEditPlaceProfile} className="gap-2 text-muted-foreground">
                            <UserPen size={15} aria-hidden />
                            {t('sidebar.editMyProfile')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

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
                    className="focus-ring min-h-9 border-hairline bg-well pl-8 text-callout shadow-well transition-shadow ease-tactile"
                />
            </div>

            <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-overline text-muted-foreground">{t('sidebar.channels')}</span>
                <span className="flex items-center">
                    <button
                        onClick={onOpenSaved}
                        title={t('saved.title')}
                        aria-label={t('saved.title')}
                        className="focus-ring tactile flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <Bookmark size={15} aria-hidden />
                    </button>
                    {/* Default Cloud (Self Channel only) does not support channel creation — hide the action. */}
                    {!isDefaultMode && (
                        <button
                            onClick={onCreateChannel}
                            title={t('rail.addChannel')}
                            aria-label={t('rail.addChannel')}
                            className="focus-ring tactile -mr-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                        >
                            <Plus size={16} aria-hidden />
                        </button>
                    )}
                </span>
            </div>
        </div>
    );
};
