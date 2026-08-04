import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Bookmark, Check, ChevronRight, Copy, MessageSquare, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { getActiveServerContext } from '@chatic/web-core';

import { canModifyMessage, hasMyReaction, threadRootId, type MessageGroup, type ReactionTally } from '../utils';
import { Skeleton, UserProfilePopover, avatarStyle, useSavedItemsStore } from '../../../shared';
import { useMessageActions, useReactions } from '../hooks';
import { EmojiPicker } from './EmojiPicker';
import { LinkPreviewCard } from './LinkPreviewCard';
import { ReactionBar } from './ReactionBar';
import { RichText } from './RichText';

// Active place id (with the relay 'default' sentinel), read at call time so a saved item is
// tagged with the place it was captured in. Non-reactive on purpose: this value is only needed
// inside the save onClick, so a per-row session subscription would re-render every row on
// unrelated session changes for nothing.
const currentPlaceId = (): string | undefined => {
    const server = getActiveServerContext();
    return server.kind === 'cloud' ? (server.siteId ?? undefined) : 'default';
};

/** A thread reply author, display-resolved (Place Profile / roster / viewer). */
export interface ThreadReplierView {
    key: string;
    name: string;
    thumbnail?: string;
    colorSeed: string;
}

/** ThreadMeta with repliers resolved for rendering — built by MessageList. */
export interface ThreadMetaView {
    count: number;
    lastReplyAt: number;
    repliers: ThreadReplierView[];
}

interface MessageRowProps {
    group: MessageGroup;
    onRetry?: (message: DomainChat) => void;
    /** Remove an unsent (failed / stuck-pending) message from the local cache. */
    onDiscard?: (message: DomainChat) => void;
    /** Folded reactions for the whole feed, keyed by message id. */
    reactions?: ReadonlyMap<string, ReactionTally[]>;
    /** Resolves a reactor's display name for the chip's label. */
    reactorName: (userId: string) => string;
    /** root id → loaded reply aggregate; a message with an entry shows a thread footer. */
    threadMeta?: ReadonlyMap<string, ThreadMetaView>;
    /** Open the thread for a root id. Absent inside the thread panel (no nested replies). */
    onOpenThread?: (rootId: string) => void;
    /** Lowercased names that count as "me" — my mentions render highlighted. */
    selfNames?: string[];
    /** chatNo of a message to flash (saved-item / search jump landed on it). */
    highlightChatNo?: number;
    /** Thread panel: qualify the header time with the day ("Today at 3:28 PM"). */
    withDayInTime?: boolean;
}

/**
 * A pending message older than this never got its send resolved (e.g. rows
 * stranded by the old null-ack bug, or a tab killed mid-send) — surface it as
 * failed so Retry/Delete apply, instead of dimming it forever.
 */
/** Shared shape of every icon button in the message hover toolbar; each adds its own hover pair. */
const TOOLBAR_BUTTON =
    'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile';

const STUCK_PENDING_MS = 60_000;

const formatTime = (ms: number): string => {
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Slack-style thread header time: prefix the day ("Today" / "Yesterday" / "Jun
// 12", with the year only when it differs) so the thread reads without date
// dividers. Falls back to the bare time on a bad timestamp.
const formatDayTime = (ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string => {
    const time = formatTime(ms);
    if (!time) return '';
    const date = new Date(ms);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    let day: string;
    if (isSameCalendarDay(date, now)) day = t('chat.today');
    else if (isSameCalendarDay(date, yesterday)) day = t('chat.yesterday');
    else {
        day = date.toLocaleDateString(
            [],
            date.getFullYear() === now.getFullYear()
                ? { month: 'short', day: 'numeric' }
                : { year: 'numeric', month: 'short', day: 'numeric' }
        );
    }
    return t('chat.thread.headerTime', { day, time });
};

export const MessageRow = memo(
    ({
        group,
        onRetry,
        onDiscard,
        reactions,
        reactorName,
        threadMeta,
        onOpenThread,
        selfNames,
        highlightChatNo,
        withDayInTime,
    }: MessageRowProps) => {
        const { t } = useTranslation();
        const [copiedKey, setCopiedKey] = useState<string | null>(null);
        // Which message in this block is open in the inline editor, and the text so far.
        // Local to the row: one message is edited at a time and the draft dies with it.
        const [editingKey, setEditingKey] = useState<string | null>(null);
        const [draft, setDraft] = useState('');
        const { editMessage, deleteMessage, failedId } = useMessageActions();
        const { toggleReaction, failedId: reactionFailedId } = useReactions();
        const savedItems = useSavedItemsStore(s => s.items);
        const toggleSaved = useSavedItemsStore(s => s.toggle);
        const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
        // Blank the avatar initial while the name resolves so "U" (Unknown) never flashes.
        const initial = group.namePending ? '' : group.ownerName.charAt(0).toUpperCase() || '?';
        // Same identity for both popover triggers (avatar + name) — the card must
        // mirror exactly what this row rendered.
        const profileProps = {
            userId: group.ownerId ?? '',
            fallbackName: group.ownerName,
            fallbackThumbnail: group.avatar,
            colorSeed: group.colorSeed,
            isMe: group.isMine,
        };

        const copy = (key: string, content: string) => {
            void navigator.clipboard?.writeText(content).then(() => {
                setCopiedKey(key);
                if (copyTimer.current) clearTimeout(copyTimer.current);
                copyTimer.current = setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1200);
            });
        };

        // Cancel a pending "copied" reset if this row unmounts mid-feedback.
        useEffect(
            () => () => {
                if (copyTimer.current) clearTimeout(copyTimer.current);
            },
            []
        );

        return (
            // The full-width hover band is the toolbar's runway: it has to read in
            // peripheral vision on wide windows, so it is stronger than a typical
            // list hover.
            <div className="group flex gap-3 rounded-md px-2 py-1 -mx-2 transition-colors ease-tactile hover:bg-accent/70">
                <UserProfilePopover {...profileProps}>
                    {/* The focus ring traces the button, so its radius has to follow the
                        avatar's — a square ring around a round disc reads as a bug. */}
                    <button type="button" className="focus-ring tactile h-8 w-8 shrink-0 rounded-full">
                        <Avatar className="h-8 w-8">
                            {group.avatar && <AvatarImage src={group.avatar} alt={group.ownerName} />}
                            <AvatarFallback className="text-caption font-semibold" style={avatarStyle(group.colorSeed)}>
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                    </button>
                </UserProfilePopover>
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-baseline gap-1.5">
                        {group.namePending ? (
                            <Skeleton className="h-3.5 w-24 rounded" />
                        ) : (
                            <UserProfilePopover {...profileProps}>
                                <button
                                    type="button"
                                    className="focus-ring truncate rounded text-heading text-foreground hover:underline"
                                >
                                    {group.ownerName}
                                </button>
                            </UserProfilePopover>
                        )}
                        <span className="text-caption tabular-nums text-muted-foreground">
                            {withDayInTime ? formatDayTime(group.timestamp, t) : formatTime(group.timestamp)}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        {group.messages.map((message, i) => {
                            // A long-pending row is an unsent artifact, not an in-flight
                            // send — treat it as failed so Retry/Delete are offered.
                            const isStuck =
                                !!message.isPending &&
                                Date.now() - (message.createdAt ?? message.createdAtMs ?? 0) > STUCK_PENDING_MS;
                            const isPending = message.isPending && !isStuck;
                            const isFailed = message.isFailed || isStuck;
                            const key = String(message.id ?? message.tempId ?? message.chatNo);
                            const content = message.content ?? '';
                            const firstUrl = content.match(/https?:\/\/[^\s]+/)?.[0];
                            const isCopied = copiedKey === key;
                            const msgTime = formatTime(message.createdAt ?? message.createdAtMs);
                            // A loaded thread hangs off this message → show a reply footer.
                            // The index is keyed by the root's chatNo string (buildThreadIndex
                            // normalises optimistic full-id parentIds onto it). threadMeta is only
                            // supplied for the main feed; the thread panel passes none, so replies
                            // never get a footer.
                            const meta = message.chatNo != null ? threadMeta?.get(String(message.chatNo)) : undefined;
                            // Reactions on this message, if any — `foldReactions` never stores an
                            // empty array, so presence is the same question as "has reactions".
                            const tallies = message.id ? reactions?.get(message.id) : undefined;
                            // A row the server has accepted: it has an id to address and is neither
                            // in flight nor failed. Every toolbar action needs exactly this.
                            const isSettled = !!message.id && !isPending && !isFailed;
                            return (
                                // Reserve the toolbar slot: both actions in the main feed, copy
                                // only in the (narrower) thread panel — a full 80px reserve there
                                // wastes scarce width.
                                <div
                                    key={key}
                                    data-chat-no={message.chatNo}
                                    className={cn(
                                        'group/msg relative rounded-md transition-colors ease-tactile',
                                        onOpenThread ? 'pr-20' : 'pr-12',
                                        message.chatNo != null &&
                                            message.chatNo === highlightChatNo &&
                                            'bg-primary/10 ring-1 ring-primary/40'
                                    )}
                                >
                                    {i > 0 && msgTime && (
                                        <span className="absolute -left-12 top-0.5 hidden w-10 text-right text-[10px] tabular-nums text-muted-foreground/70 group-hover/msg:block">
                                            {msgTime}
                                        </span>
                                    )}
                                    {message.hidden ? (
                                        // Only reached for a deleted message that has replies
                                        // (ChatPane keeps those); the thread bar below still
                                        // renders, so the conversation under it stays reachable.
                                        <p className="whitespace-pre-wrap break-words text-body italic text-muted-foreground">
                                            {t('chat.deletedRoot')}
                                        </p>
                                    ) : editingKey === key ? (
                                        // The message becomes its own editor in place, so the
                                        // surrounding conversation stays readable while you fix a
                                        // typo. Enter saves, Escape abandons — no dialog.
                                        <div className="flex flex-col gap-1">
                                            <textarea
                                                autoFocus
                                                rows={Math.min(8, draft.split('\n').length)}
                                                value={draft}
                                                onChange={e => setDraft(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        setEditingKey(null);
                                                        return;
                                                    }
                                                    if (e.key !== 'Enter' || e.shiftKey) return;
                                                    e.preventDefault();
                                                    const next = draft.trim();
                                                    setEditingKey(null);
                                                    // An edit to nothing is a delete everywhere else;
                                                    // here it would just blank the row, so ignore it.
                                                    if (next && next !== content && message.id) {
                                                        editMessage(message.id, next);
                                                    }
                                                }}
                                                aria-label={t('chat.edit')}
                                                className="focus-ring w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-body text-foreground"
                                            />
                                            <span className="text-micro text-muted-foreground">
                                                {t('chat.editHint')}
                                            </span>
                                        </div>
                                    ) : (
                                        <p
                                            className={cn(
                                                // Opt message text back into selection: the app body sets
                                                // user-select:none for chrome (Slack/Discord-style), which
                                                // otherwise blocks copying message content.
                                                'select-text whitespace-pre-wrap break-words text-body',
                                                isFailed ? 'text-destructive' : 'text-foreground',
                                                isPending && 'opacity-50'
                                            )}
                                        >
                                            <RichText content={content} selfNames={selfNames} />
                                        </p>
                                    )}
                                    {failedId === message.id && (
                                        <span className="mt-0.5 block text-caption text-destructive">
                                            {t('chat.editFailed')}
                                        </span>
                                    )}
                                    {/* Unfurl the first link only (Slack-style single card).
                                        Message-level, not RichText: the formatter stays pure and
                                        the card renders outside the host <p>. */}
                                    {firstUrl && <LinkPreviewCard url={firstUrl} />}
                                    {tallies && (
                                        <ReactionBar
                                            tallies={tallies}
                                            nameOf={reactorName}
                                            onToggle={(emoji, isMine) =>
                                                message.id && toggleReaction(message.id, emoji, isMine)
                                            }
                                        />
                                    )}
                                    {/* Outside the block above on purpose: the first reaction on a
                                        message leaves no chips behind when it fails, so a line nested
                                        under `tallies` would be exactly the case that stays silent. */}
                                    {reactionFailedId === message.id && (
                                        <span className="mt-0.5 block text-caption text-destructive">
                                            {t('chat.reaction.failed')}
                                        </span>
                                    )}
                                    {/* Slack-style action toolbar: an elevated pill at a FIXED
                                    far-right position (spatial muscle memory), aligned with the
                                    message's first line so it stays inside the hover band. It
                                    slides in on hover — peripheral vision picks up the motion
                                    onset where a static pill goes unnoticed on wide windows. */}
                                    {((onOpenThread && isSettled) || content) && (
                                        <div
                                            className={cn(
                                                'absolute -top-10 right-0 z-10 flex items-center gap-0.5 rounded-lg border border-hairline bg-elevated p-0.5 shadow-overlay transition-[opacity,transform] duration-150 ease-tactile motion-reduce:transition-none motion-reduce:translate-x-0',
                                                isCopied
                                                    ? 'translate-x-0 opacity-100'
                                                    : 'translate-x-0 opacity-100 focus-within:translate-x-0 focus-within:opacity-100 [@media(hover:hover)]:translate-x-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:translate-x-0 [@media(hover:hover)]:group-hover/msg:opacity-100 [@media(hover:hover)]:focus-within:translate-x-0 [@media(hover:hover)]:focus-within:opacity-100'
                                            )}
                                        >
                                            {isSettled && (
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <button
                                                            type="button"
                                                            title={t('chat.reaction.add')}
                                                            aria-label={t('chat.reaction.add')}
                                                            className={cn(
                                                                TOOLBAR_BUTTON,
                                                                'hover:bg-accent hover:text-foreground'
                                                            )}
                                                        >
                                                            <SmilePlus size={16} />
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent align="end" side="top" className="w-auto p-2">
                                                        {/* Picking one you already used toggles it
                                                            off, rather than publishing a second
                                                            redundant `on` the fold would dedupe. */}
                                                        {/* Picking one you already used turns it off.
                                                            `hasMyReaction` normalises first, so a picker
                                                            that emits `❤️` still matches a stored `❤`. */}
                                                        <EmojiPicker
                                                            onPick={emoji =>
                                                                message.id &&
                                                                toggleReaction(
                                                                    message.id,
                                                                    emoji,
                                                                    hasMyReaction(tallies, emoji)
                                                                )
                                                            }
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            )}
                                            {onOpenThread && isSettled && (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenThread(threadRootId(message))}
                                                    title={t('chat.thread.replyAction')}
                                                    aria-label={t('chat.thread.replyAction')}
                                                    className={cn(
                                                        TOOLBAR_BUTTON,
                                                        'hover:bg-accent hover:text-foreground'
                                                    )}
                                                >
                                                    <Reply size={16} />
                                                </button>
                                            )}
                                            {content && isSettled && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleSaved({
                                                            id: key,
                                                            channelId: message.channelId ?? '',
                                                            chatNo: message.chatNo,
                                                            content,
                                                            ownerName: group.ownerName,
                                                            avatar: group.avatar,
                                                            colorSeed: group.colorSeed,
                                                            ownerId: group.ownerId,
                                                            placeId: currentPlaceId(),
                                                            parentId: message.parentId,
                                                        })
                                                    }
                                                    title={savedItems[key] ? t('chat.unsave') : t('chat.save')}
                                                    aria-label={savedItems[key] ? t('chat.unsave') : t('chat.save')}
                                                    aria-pressed={!!savedItems[key]}
                                                    className={cn(
                                                        TOOLBAR_BUTTON,
                                                        'hover:bg-accent hover:text-foreground'
                                                    )}
                                                >
                                                    <Bookmark
                                                        size={16}
                                                        className={
                                                            savedItems[key]
                                                                ? 'fill-current text-primary-ink'
                                                                : undefined
                                                        }
                                                    />
                                                </button>
                                            )}
                                            {canModifyMessage(message, group.isMine) && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDraft(content);
                                                            setEditingKey(key);
                                                        }}
                                                        title={t('chat.edit')}
                                                        aria-label={t('chat.edit')}
                                                        className={cn(
                                                            TOOLBAR_BUTTON,
                                                            'hover:bg-accent hover:text-foreground'
                                                        )}
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => message.id && deleteMessage(message.id)}
                                                        title={t('chat.delete')}
                                                        aria-label={t('chat.delete')}
                                                        className={cn(
                                                            TOOLBAR_BUTTON,
                                                            'hover:bg-destructive/10 hover:text-destructive'
                                                        )}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                            {content && (
                                                <button
                                                    type="button"
                                                    onClick={() => copy(key, content)}
                                                    title={isCopied ? t('chat.copied') : t('chat.copy')}
                                                    aria-label={t('chat.copy')}
                                                    className={cn(
                                                        TOOLBAR_BUTTON,
                                                        'hover:bg-accent hover:text-foreground'
                                                    )}
                                                >
                                                    {isCopied ? (
                                                        <Check size={16} className="text-primary-ink" />
                                                    ) : (
                                                        <Copy size={16} />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {isFailed && (
                                        <span className="mt-0.5 flex items-center gap-1.5 text-caption text-destructive">
                                            {t('chat.failed')}
                                            {onRetry && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRetry(message)}
                                                    className="focus-ring tactile inline-flex min-h-[36px] items-center font-semibold underline underline-offset-2 hover:opacity-80"
                                                >
                                                    {t('chat.retry')}
                                                </button>
                                            )}
                                            {onDiscard && (
                                                <button
                                                    type="button"
                                                    onClick={() => onDiscard(message)}
                                                    className="focus-ring tactile inline-flex min-h-[36px] items-center gap-1 font-semibold text-muted-foreground underline underline-offset-2 hover:opacity-80"
                                                >
                                                    <Trash2 size={12} aria-hidden />
                                                    {t('chat.deleteUnsent')}
                                                </button>
                                            )}
                                        </span>
                                    )}
                                    {meta && onOpenThread && (
                                        // Slack-style thread bar: replier avatars + count, with a
                                        // bordered card + "View thread" + chevron surfacing on hover.
                                        <button
                                            type="button"
                                            onClick={() => onOpenThread(threadRootId(message))}
                                            aria-label={t('chat.thread.openThread', { count: meta.count })}
                                            className="group/thread focus-ring tactile -mx-1.5 mt-1 flex w-full max-w-md items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left text-caption transition-colors ease-tactile hover:border-hairline hover:bg-elevated hover:shadow-raised"
                                        >
                                            {meta.repliers.length > 0 ? (
                                                <span className="flex shrink-0 items-center gap-0.5">
                                                    {meta.repliers.map(replier => (
                                                        <Avatar key={replier.key} className="h-5 w-5">
                                                            {replier.thumbnail && (
                                                                <AvatarImage
                                                                    src={replier.thumbnail}
                                                                    alt={replier.name}
                                                                />
                                                            )}
                                                            <AvatarFallback
                                                                className="rounded text-[9px] font-semibold"
                                                                style={avatarStyle(replier.colorSeed)}
                                                            >
                                                                {replier.name.charAt(0).toUpperCase() || '?'}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    ))}
                                                </span>
                                            ) : (
                                                <MessageSquare
                                                    size={14}
                                                    aria-hidden
                                                    className="shrink-0 text-primary-ink"
                                                />
                                            )}
                                            <span className="shrink-0 font-semibold tabular-nums text-primary-ink group-hover/thread:underline">
                                                {t('chat.thread.replyCount', { count: meta.count })}
                                            </span>
                                            {meta.lastReplyAt > 0 && (
                                                <span className="truncate text-muted-foreground group-hover/thread:hidden">
                                                    {t('chat.thread.lastReplyAt', {
                                                        time: formatTime(meta.lastReplyAt),
                                                    })}
                                                </span>
                                            )}
                                            <span className="hidden truncate text-muted-foreground group-hover/thread:inline">
                                                {t('chat.thread.view')}
                                            </span>
                                            <ChevronRight
                                                size={14}
                                                aria-hidden
                                                className="ml-auto hidden shrink-0 text-muted-foreground group-hover/thread:block"
                                            />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }
);

MessageRow.displayName = 'MessageRow';
