import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AtSign, Bookmark, Search, UserPen } from 'lucide-react';

import { Skeleton, unreadMentionCount, useMentionsStore } from '../../../shared';
import { NotificationSnoozeButton } from './NotificationSnoozeButton';
import { SIDEBAR_ACTION_ROW } from './sidebarStyles';

interface SidebarHeaderProps {
    /** Display name of the active place (place switching now lives in the place rail). */
    placeName: string;
    isLoading: boolean;
    /** Default Cloud (Guest Session): no places to switch — show a static label. */
    isDefaultMode: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    /** Open the place-profile editor for the active place (per-place identity lives here). */
    onEditPlaceProfile: () => void;
    /** Open the device-local Saved-items trailing pane. */
    onOpenSaved: () => void;
    /** Open the device-local mentions inbox (Activity) trailing pane. */
    onOpenActivity: () => void;
}

interface ActionRowProps {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    /** Small lime dot on the icon — something inside is unread. */
    hasDot?: boolean;
}

const ActionRow = ({ icon, label, onClick, hasDot }: ActionRowProps) => (
    <button type="button" onClick={onClick} className={SIDEBAR_ACTION_ROW}>
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
            {icon}
            {hasDot && (
                <span
                    aria-hidden
                    className="absolute right-0 top-0 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar"
                />
            )}
        </span>
        <span className="truncate">{label}</span>
    </button>
);

/**
 * Sidebar top (Figma Channel List Panel): the active place as a static title (the
 * place rail owns switching), a pill channel search, and the per-place actions as
 * labelled rows — edit my profile, notifications, activity, saved.
 */
export const SidebarHeader = ({
    placeName,
    isLoading,
    isDefaultMode,
    query,
    onQueryChange,
    onEditPlaceProfile,
    onOpenSaved,
    onOpenActivity,
}: SidebarHeaderProps) => {
    const { t } = useTranslation();
    // Select the boolean, not the count — the dot only re-renders on false↔true.
    const hasMentionUnread = useMentionsStore(s => unreadMentionCount(s.items) > 0);
    const showPlaceSkeleton = isLoading && !placeName && !isDefaultMode;

    return (
        <div className="flex flex-col gap-1 px-4 pt-7">
            <div className="flex flex-col gap-4">
                {showPlaceSkeleton ? (
                    <Skeleton className="h-5 w-28" />
                ) : (
                    <h2 className="truncate px-0.5 text-[18px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                        {isDefaultMode ? t('place.home') : placeName || t('place.none')}
                    </h2>
                )}
                {/* ⌘K opens the QuickSwitcher (see QuickSwitcher.tsx); this inline filter stays click-to-use. */}
                <label className="flex items-center gap-2 rounded-full bg-well px-3.5 py-3 focus-within:ring-2 focus-within:ring-primary/50">
                    <Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        placeholder={t('sidebar.search')}
                        aria-label={t('sidebar.search')}
                        className="min-w-0 flex-1 bg-transparent text-[14px] tracking-[-0.01em] text-foreground outline-none placeholder:text-placeholder"
                    />
                </label>
            </div>
            <div className="flex flex-col gap-2 py-2">
                {!isDefaultMode && (
                    <ActionRow
                        icon={<UserPen size={18} aria-hidden />}
                        label={t('sidebar.editMyProfile')}
                        onClick={onEditPlaceProfile}
                    />
                )}
                <NotificationSnoozeButton />
                <ActionRow
                    icon={<AtSign size={18} aria-hidden />}
                    label={t('activity.title')}
                    onClick={onOpenActivity}
                    hasDot={hasMentionUnread}
                />
                <ActionRow icon={<Bookmark size={18} aria-hidden />} label={t('saved.title')} onClick={onOpenSaved} />
            </div>
        </div>
    );
};
