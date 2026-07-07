import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AtSign, Bookmark, Plus, Search, UserPen } from 'lucide-react';

import { Input } from '@chatic/ui-kit/components/ui/input';

import { Skeleton, unreadMentionCount, useMentionsStore } from '../../../shared';
import { NotificationSnoozeButton } from './NotificationSnoozeButton';

interface SidebarHeaderProps {
    /** Display name of the active place (place switching now lives in the place rail). */
    placeName: string;
    isLoading: boolean;
    /** Default Cloud (Guest Session): no places to switch — show a static label. */
    isDefaultMode: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onCreateChannel: () => void;
    /** Open the place-profile editor for the active place (per-place identity lives here). */
    onEditPlaceProfile: () => void;
    /** Open the device-local Saved-items trailing pane. */
    onOpenSaved: () => void;
    /** Open the device-local mentions inbox (Activity) trailing pane. */
    onOpenActivity: () => void;
}

/**
 * Sidebar top: the active place as a static title (the place rail owns
 * switching), paired with the edit-my-profile and Saved actions, a channel
 * search box, and the channel-section label with a create action.
 */
export const SidebarHeader = ({
    placeName,
    isLoading,
    isDefaultMode,
    query,
    onQueryChange,
    onCreateChannel,
    onEditPlaceProfile,
    onOpenSaved,
    onOpenActivity,
}: SidebarHeaderProps) => {
    const { t } = useTranslation();
    // Select the boolean, not the count — the dot only re-renders on false↔true.
    const hasMentionUnread = useMentionsStore(s => unreadMentionCount(s.items) > 0);
    const showPlaceSkeleton = isLoading && !placeName && !isDefaultMode;
    // ⌘K now opens the QuickSwitcher (see QuickSwitcher.tsx); the inline filter
    // below stays click-to-use.
    const searchRef = useRef<HTMLInputElement>(null);

    return (
        <div className="flex flex-col gap-2.5 border-b border-hairline px-3 pb-3 pt-3">
            {/* Active place title + per-place actions (edit profile, Saved items). */}
            <div className="flex items-center gap-1">
                {showPlaceSkeleton ? (
                    <Skeleton className="h-5 w-28 flex-1" />
                ) : (
                    <span className="min-w-0 flex-1 truncate px-2 py-1.5 text-title text-sidebar-foreground">
                        {isDefaultMode ? t('place.home') : placeName || t('place.none')}
                    </span>
                )}
                {!isDefaultMode && (
                    <button
                        onClick={onEditPlaceProfile}
                        title={t('sidebar.editMyProfile')}
                        aria-label={t('sidebar.editMyProfile')}
                        className="focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <UserPen size={16} aria-hidden />
                    </button>
                )}
                <NotificationSnoozeButton />
                <button
                    onClick={onOpenActivity}
                    title={t('activity.title')}
                    aria-label={t('activity.title')}
                    className="focus-ring tactile relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <AtSign size={16} aria-hidden />
                    {hasMentionUnread && (
                        <span
                            aria-hidden
                            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                        />
                    )}
                </button>
                <button
                    onClick={onOpenSaved}
                    title={t('saved.title')}
                    aria-label={t('saved.title')}
                    className="focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <Bookmark size={16} aria-hidden />
                </button>
            </div>

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
            </div>
        </div>
    );
};
