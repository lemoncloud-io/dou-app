import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, MessagesSquare, Search, UserPen } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { Skeleton } from '../../../shared';
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
    /** Open the device-local Saved items page in the main pane. */
    onOpenSaved: () => void;
    /** The Saved items page holds the main pane: its row is the current one. */
    isSavedOpen?: boolean;
    /** Open the Threads page — the threads I take part in — in the main pane. */
    onOpenThreads: () => void;
    isThreadsOpen?: boolean;
    /** A listed thread has a reply I have not looked at: the row carries the unread dot. */
    hasUnreadThreads?: boolean;
}

interface ActionRowProps {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    isActive?: boolean;
    hasUnread?: boolean;
}

const ActionRow = ({ icon, label, onClick, isActive, hasUnread }: ActionRowProps) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={isActive ? 'page' : undefined}
            aria-label={hasUnread ? t('nav.unread', { name: label }) : undefined}
            className={cn(SIDEBAR_ACTION_ROW, 'px-1.5', isActive && 'bg-primary/[0.16] text-foreground')}
        >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">{icon}</span>
            <span className={cn('truncate', hasUnread && 'font-semibold text-foreground')}>{label}</span>
            {hasUnread && <span aria-hidden className="ml-auto h-2 w-2 shrink-0 rounded-full bg-badge-unread" />}
        </button>
    );
};

/**
 * Sidebar top (Figma Channel List Panel): the active place as a static title (the
 * place rail owns switching), a pill channel search, then Threads, Saved and editing my profile in this
 * place as labelled rows. Mentions, thread replies and the snooze live in the Notifications
 * destination.
 */
export const SidebarHeader = ({
    placeName,
    isLoading,
    isDefaultMode,
    query,
    onQueryChange,
    onEditPlaceProfile,
    onOpenSaved,
    isSavedOpen,
    onOpenThreads,
    isThreadsOpen,
    hasUnreadThreads,
}: SidebarHeaderProps) => {
    const { t } = useTranslation();
    const showPlaceSkeleton = isLoading && !placeName && !isDefaultMode;

    return (
        <div className="flex flex-col gap-1 px-4 pt-7">
            <div className="flex flex-col gap-4">
                {showPlaceSkeleton ? (
                    <Skeleton className="h-5 w-28" />
                ) : (
                    <h2 className="truncate px-0.5 text-lead font-semibold text-sidebar-foreground">
                        {isDefaultMode ? t('place.home') : placeName || t('place.none')}
                    </h2>
                )}
                {/* ⌘K opens the QuickSwitcher (see QuickSwitcher.tsx); this inline filter stays click-to-use. */}
                <label className="flex items-center gap-2 rounded-full bg-well px-3.5 py-3 focus-within:ring-2 focus-within:ring-ring">
                    <Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        placeholder={t('sidebar.search')}
                        aria-label={t('sidebar.search')}
                        className="min-w-0 flex-1 bg-transparent text-callout text-foreground outline-none placeholder:text-placeholder"
                    />
                </label>
            </div>
            <div aria-hidden className="mt-3 h-px w-full shrink-0 bg-hairline" />
            <div className="flex flex-col gap-2 py-2">
                {/* Threads and Saved lead (Figma Home); editing my profile here has no other way in. */}
                <ActionRow
                    icon={<MessagesSquare size={18} aria-hidden />}
                    label={t('threads.title')}
                    onClick={onOpenThreads}
                    isActive={isThreadsOpen}
                    hasUnread={hasUnreadThreads}
                />
                <ActionRow
                    icon={<Bookmark size={18} aria-hidden />}
                    label={t('saved.title')}
                    onClick={onOpenSaved}
                    isActive={isSavedOpen}
                />
                {!isDefaultMode && (
                    <ActionRow
                        icon={<UserPen size={18} aria-hidden />}
                        label={t('sidebar.editMyProfile')}
                        onClick={onEditPlaceProfile}
                    />
                )}
            </div>
        </div>
    );
};
