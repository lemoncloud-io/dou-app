import { memo, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Plus, Search } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { formatListTime, Skeleton } from '../../../../shared';
import { threadRootId } from '../../utils';

/**
 * A preview line, led by a thread mark when its message is a thread reply — so a reply does not read
 * as a message in the room itself. The mark goes in front of the sender.
 */
export const markThreadReply = (lastChat: Pick<DomainChat, 'parentId'>, line: string, t: TFunction): string =>
    lastChat.parentId ? t('lists.threadReply', { text: line }) : line;

/** Picking a row whose preview is a thread reply also names that reply's thread. */
export type SelectConversation = (channelId: string, thread?: { threadRootId: string }) => void;

/**
 * The row click for a list that previews each room's last message. A room's last message can be a
 * thread reply, and the room's feed leaves replies to the thread panel, so opening only the room
 * would show nothing of the line the row printed. The pick names the thread so the host opens it.
 *
 * The previews are read through a ref: they change on every message in any room, and a handler that
 * changed with them would re-render every memo'd row instead of only the one whose line moved.
 */
export const usePickConversation = (lastByChannel: Map<string, DomainChat>, onSelect: SelectConversation) => {
    const lastRef = useRef(lastByChannel);
    lastRef.current = lastByChannel;
    return useCallback(
        (channelId: string) => {
            const lastChat = lastRef.current.get(channelId);
            if (lastChat?.parentId) onSelect(channelId, { threadRootId: threadRootId(lastChat) });
            else onSelect(channelId);
        },
        [onSelect]
    );
};

/**
 * One 60px row of the Channels or DM list: the room's tile or the person's avatar, its name (bold
 * while unread), the last message's time, the preview line and the unread count.
 */
export const ConversationRow = memo(function ConversationRow({
    id,
    leading,
    label,
    time,
    preview,
    unread,
    isActive,
    onSelect,
}: {
    id: string;
    leading: ReactNode;
    label: string;
    /** The last message's time, in ms; nothing is drawn without one. */
    time: number | undefined;
    preview: string;
    unread: number;
    isActive: boolean;
    onSelect: (id: string) => void;
}) {
    const { t } = useTranslation();
    return (
        <li>
            <button
                type="button"
                aria-current={isActive || undefined}
                onClick={() => onSelect(id)}
                className={cn(
                    'focus-ring flex h-[3.75rem] w-full items-center gap-3 rounded-xl pl-2.5 pr-3 text-left transition-colors ease-tactile',
                    isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent'
                )}
            >
                {leading}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                        <span
                            className={cn(
                                'truncate text-callout text-foreground',
                                unread > 0 ? 'font-bold' : 'font-semibold'
                            )}
                        >
                            {label}
                        </span>
                        <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                            {formatListTime(time)}
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="truncate text-caption text-muted-foreground">{preview}</span>
                        {unread > 0 && (
                            <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-unread px-1 text-tiny font-semibold tabular-nums text-badge-unread-foreground">
                                <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
                                <span className="sr-only">{t('sidebar.unreadCount', { count: unread })}</span>
                            </span>
                        )}
                    </span>
                </span>
            </button>
        </li>
    );
});

/** A row whose person has no name yet: the row's shape, never the raw id. */
export const PendingConversationRow = () => (
    <li aria-hidden className="flex h-[3.75rem] items-center gap-3 pl-2.5 pr-3">
        <Skeleton className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
        <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24 animate-pulse bg-muted" />
            <Skeleton className="h-3 w-40 animate-pulse bg-muted" />
        </span>
    </li>
);

interface ConversationListProps {
    title: string;
    /** The header's + and the empty state's button; absent where nothing can be started here. */
    create?: { label: string; onClick: () => void };
    search: { label: string; query: string; onChange: (query: string) => void };
    empty: { icon: ReactNode; title: string; hint: string };
    noMatch: string;
    /** The place has no room of this kind. */
    isEmpty: boolean;
    /** While the place's channels load, an empty list is not yet an empty place. */
    isLoading: boolean;
    /** The rows, already filtered by the search; none when the search matches nothing. */
    children: ReactNode[];
}

/**
 * The frame the Channels and DM destinations share in the sidebar column: a title with its +, a
 * search field, then the rows, the empty state or the no-match line.
 */
export const ConversationList = ({
    title,
    create,
    search,
    empty,
    noMatch,
    isEmpty,
    isLoading,
    children,
}: ConversationListProps) => (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-[4.25rem] shrink-0 items-center justify-between gap-2 pl-5 pr-3.5">
            <h2 className="truncate text-headline font-bold text-sidebar-foreground">{title}</h2>
            {create && (
                <button
                    type="button"
                    aria-label={create.label}
                    onClick={create.onClick}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <Plus size={18} aria-hidden />
                </button>
            )}
        </header>
        {!isEmpty && (
            <div className="flex h-12 shrink-0 items-center px-4">
                <label className="flex w-full items-center gap-2 rounded-full bg-well px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                    <Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                    <input
                        type="search"
                        value={search.query}
                        onChange={event => search.onChange(event.target.value)}
                        placeholder={search.label}
                        aria-label={search.label}
                        className="min-w-0 flex-1 bg-transparent text-callout text-foreground outline-none placeholder:text-placeholder"
                    />
                </label>
            </div>
        )}
        {isEmpty && isLoading ? null : isEmpty ? (
            <div
                role="status"
                aria-live="polite"
                className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
            >
                <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                    {empty.icon}
                </span>
                <p className="text-heading text-foreground">{empty.title}</p>
                <p className="max-w-xs text-caption text-muted-foreground">{empty.hint}</p>
                {create && (
                    <button
                        type="button"
                        onClick={create.onClick}
                        className="focus-ring tactile mt-3 flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-semibold text-primary-foreground transition-colors ease-tactile hover:bg-primary/90"
                    >
                        <Plus size={14} aria-hidden />
                        {create.label}
                    </button>
                )}
            </div>
        ) : children.length === 0 ? (
            <p role="status" className="px-6 py-8 text-center text-caption text-muted-foreground">
                {noMatch}
            </p>
        ) : (
            <ul className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-6">
                {children}
            </ul>
        )}
    </section>
);
