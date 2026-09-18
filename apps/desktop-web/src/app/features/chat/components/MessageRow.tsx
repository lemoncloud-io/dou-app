import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Bookmark,
    Check,
    ChevronRight,
    Copy,
    MessageSquare,
    MoreHorizontal,
    Pencil,
    Reply,
    SmilePlus,
    Trash2,
} from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { runtime } from '@chatic/app-runtime';

import { ConfirmDialog } from '../../channels';
import {
    canModifyMessage,
    hasMyReaction,
    isEdited,
    threadRootId,
    type MessageGroup,
    type ReactionTally,
    type ReadCount,
} from '../utils';
import {
    Hint,
    Skeleton,
    UserProfilePopover,
    avatarStyle,
    formatClockTime,
    formatShortDate,
    useSavedItemsStore,
} from '../../../shared';
import { useMessageActions, useReactions } from '../hooks';
import { QUICK_REACTIONS, useRecentEmojiStore } from '../stores';
import { EmojiPicker } from './EmojiPicker';
import { MessageImages } from './images';
import { LinkPreviewCard } from './LinkPreviewCard';
import { ReactionBar } from './ReactionBar';
import { ReadReceipt } from './ReadReceipt';
import { BlockKitMessage, blocksToPlainText, resolveChatBlocks } from '@chatic/block-kit';

import { RichText, type MentionResolver } from './RichText';

// Active place id (with the relay 'default' sentinel), read at call time so a saved item is
// tagged with the place it was captured in. Non-reactive on purpose: this value is only needed
// inside the save onClick, so a per-row session subscription would re-render every row on
// unrelated session changes for nothing.
const currentPlaceId = (): string | undefined => {
    const server = runtime.session.getActiveServerContext();
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
    /** Resolves an @mention to a member, so the mention opens their profile. */
    resolveMention?: MentionResolver;
    /** chatNo of a message to flash (saved-item / search jump landed on it). */
    highlightChatNo?: number;
    /** Thread panel: qualify the header time with the day ("Today at 3:28 PM"). */
    withDayInTime?: boolean;
    /**
     * Read/unread counts for a message, or null when it gets no receipt (see
     * `useReadCounts`). Absent on a surface that shows no receipts at all.
     */
    /**
     * The read receipt for this block's last message, as numbers rather than a
     * getter. A getter keyed on every member's cursor changed identity on each
     * receipt anywhere in the channel, and re-rendered every row with it.
     */
    receiptRead?: number;
    receiptUnread?: number;
}

/**
 * A pending message older than this never got its send resolved (e.g. rows
 * stranded by the old null-ack bug, or a tab killed mid-send) — surface it as
 * failed so Retry/Delete apply, instead of dimming it forever.
 */
/** Shared shape of every icon button in the message hover toolbar; each adds its own hover pair. */
const TOOLBAR_BUTTON =
    'focus-ring tactile flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile';

interface ToolbarButtonProps {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
    /** Hover/active colours — destructive controls tint red instead of neutral. */
    className?: string;
    pressed?: boolean;
}

/**
 * One icon control in the message toolbar.
 *
 * Every control here is icon-only, so the label is not decoration — it is the only
 * way to learn what a button does (`Hint` says why it is not a native `title`).
 * `aria-label` carries the same string; assistive tech reads that, not the tooltip.
 */
const ToolbarButton = ({ label, onClick, children, className, pressed }: ToolbarButtonProps) => (
    <Hint label={label}>
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={pressed}
            className={cn(TOOLBAR_BUTTON, className)}
        >
            {children}
        </button>
    </Hint>
);

const STUCK_PENDING_MS = 60_000;

const sameGroup = (a: MessageGroup, b: MessageGroup): boolean =>
    a === b ||
    (a.key === b.key &&
        a.ownerId === b.ownerId &&
        a.ownerName === b.ownerName &&
        a.namePending === b.namePending &&
        a.avatar === b.avatar &&
        a.isMine === b.isMine &&
        a.colorSeed === b.colorSeed &&
        a.timestamp === b.timestamp &&
        a.messages.length === b.messages.length &&
        a.messages.every((m, i) => m === b.messages[i]));

/** Structural equality for one small map entry (a reaction tally, a thread meta). */
const sameEntry = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Pointer devices hide the toolbar until hover; touch shows it always, so it is
 * only made inert where it can actually be hidden.
 */
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches === true;

const formatTime = formatClockTime;

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
    else day = formatShortDate(ms);
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
        resolveMention,
        highlightChatNo,
        withDayInTime,
        receiptRead,
        receiptUnread,
    }: MessageRowProps) => {
        const { t } = useTranslation();
        const [copiedKey, setCopiedKey] = useState<string | null>(null);
        // `isStuck` below compares Date.now() during render, which only moves when
        // something else re-renders the row: a send that hung sat at 50% opacity
        // indefinitely, then flipped to "Not delivered" on an unrelated update.
        // This ticks the block on its own schedule while anything in it is pending.
        const [, setStuckTick] = useState(0);
        // Which message in this block the pointer or keyboard is on. The hover
        // toolbar is hidden by opacity, not removed, so without this all seven of
        // its buttons stayed in the tab order for every message — tabbing from the
        // composer walked hundreds of invisible controls. The toolbar is `inert`
        // unless its message is hovered, focused, or pinned open; the message itself
        // is the one tab stop, and focusing it lets Tab continue into its toolbar.
        const [hoverKey, setHoverKey] = useState<string | null>(null);
        const [focusKey, setFocusKey] = useState<string | null>(null);
        const hasPending = group.messages.some(message => !!message.isPending);
        useEffect(() => {
            if (!hasPending) return;
            const timer = setInterval(() => setStuckTick(tick => tick + 1), 5_000);
            return () => clearInterval(timer);
        }, [hasPending]);
        // Which message in this block is open in the inline editor, and the text so far.
        // Local to the row: one message is edited at a time and the draft dies with it.
        const [editingKey, setEditingKey] = useState<string | null>(null);
        const [draft, setDraft] = useState('');
        // Which message in this block is awaiting delete confirmation. Same shape as
        // `editingKey`: one message at a time, so one dialog is ever mounted.
        const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
        // Which message's reaction picker is open. Controlled so a pick can close it:
        // left open, the grid covers the conversation and the click reads as if it did
        // not register — there is no visible chip while the request is in flight.
        const [pickerKey, setPickerKey] = useState<string | null>(null);
        // The overflow menu portals out of the row, same as the emoji picker, so the
        // toolbar has to stay up while it is open or it vanishes under the pointer.
        const [menuKey, setMenuKey] = useState<string | null>(null);
        // Set when the picker closes because something was chosen, so the close handler
        // can tell a pick from an Escape. A ref, not state: it is read once during the
        // close and must not schedule a render of its own.
        const pickedRef = useRef(false);
        const remember = useRecentEmojiStore(s => s.remember);
        const { editMessage, deleteMessage, failure } = useMessageActions();
        const { toggleReaction, failedId: reactionFailedId } = useReactions();
        // Only this block's saved flags, as a string: zustand compares it by value,
        // so saving a message elsewhere no longer re-renders every row. Selecting
        // the whole `items` record did.
        const messageKeys = group.messages.map(message => String(message.id ?? message.tempId ?? message.chatNo));
        const savedFlags = useSavedItemsStore(s => messageKeys.map(k => (s.items[k] ? '1' : '0')).join(''));
        const isSavedKey = (key: string) => savedFlags[messageKeys.indexOf(key)] === '1';
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

        // Parsed once per group, not once per render. Hovering a row, opening the
        // emoji picker or copying flips row-local state, and re-deriving every
        // message's body from that would put a JSON.parse and the mrkdwn passes on
        // the hover path. `group` is a stable prop on a memo'd component, so this
        // recomputes exactly when the messages change.
        const bodies = useMemo(
            () =>
                group.messages.map(message => {
                    const content = message.content ?? '';
                    // A structured message, either the server's own `blocks$` field
                    // (webhook sends) or one it sent as Block Kit JSON in `content`;
                    // null for everything else, which is still the overwhelming
                    // majority. Priority: knowledge#319 SPEC.md §6-1.
                    const { blocks, source } = resolveChatBlocks(message);
                    // What the row *says*, as opposed to what it is made of. Copy,
                    // Save and the link unfurl all mean the former — reading `content`
                    // there would hand the reader the payload's JSON. On the `field`
                    // path `content` is already the server's plain-text summary
                    // (SPEC §6-5); folding `blocks` back through `blocksToPlainText`
                    // there would throw that summary away.
                    const plain = !blocks || source === 'field' ? content : blocksToPlainText(blocks);
                    return { content, blocks, plain };
                }),
            [group.messages]
        );

        const copy = (key: string, content: string) => {
            // Optional-chaining the API and then swallowing the rejection made a
            // denied or unavailable clipboard completely silent: no tick, no error.
            // Same two-branch handling the image copy already does.
            const write = navigator.clipboard?.writeText(content);
            if (!write) {
                toast({ variant: 'destructive', description: t('chat.copyFailed') });
                return;
            }
            void write.then(
                () => {
                    setCopiedKey(key);
                    if (copyTimer.current) clearTimeout(copyTimer.current);
                    copyTimer.current = setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1200);
                },
                () => toast({ variant: 'destructive', description: t('chat.copyFailed') })
            );
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
            <div className="group -mx-2 flex gap-2.5 rounded-lg px-2 py-1.5 transition-colors ease-tactile hover:bg-accent/70">
                <UserProfilePopover {...profileProps}>
                    {/* The focus ring traces the button, so its radius has to follow the
                        avatar's — a square ring around a round disc reads as a bug. */}
                    <button type="button" className="focus-ring tactile h-9 w-9 shrink-0 rounded-full">
                        <Avatar className="h-9 w-9">
                            {group.avatar && <AvatarImage src={group.avatar} alt={group.ownerName} />}
                            <AvatarFallback className="text-caption font-semibold" style={avatarStyle(group.colorSeed)}>
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                    </button>
                </UserProfilePopover>
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-1.5 flex items-baseline gap-2">
                        {group.namePending ? (
                            <Skeleton className="h-3.5 w-24 rounded" />
                        ) : (
                            <UserProfilePopover {...profileProps}>
                                <button
                                    type="button"
                                    className="focus-ring truncate rounded text-lead font-bold leading-tight tracking-[-0.005em] text-foreground hover:underline"
                                >
                                    {group.ownerName}
                                </button>
                            </UserProfilePopover>
                        )}
                        <span className="text-caption font-medium tabular-nums tracking-[-0.005em] text-description">
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
                            const { content, blocks, plain } = bodies[i];
                            const firstUrl = plain.match(/https?:\/\/[^\s]+/)?.[0];
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
                            //
                            // A deleted message shows none. The events survive the soft delete
                            // (they are separate chats pointing at this id), so the chips would
                            // otherwise sit under "This message was deleted." — people reacting
                            // to something the row says is gone, with no way to add or remove one
                            // because the toolbar is gone too.
                            const tallies = message.id && !message.hidden ? reactions?.get(message.id) : undefined;
                            // A row the server has accepted: it has an id to address and is neither
                            // in flight nor failed. Every toolbar action needs exactly this.
                            const isSettled = !!message.id && !isPending && !isFailed;
                            const isEditing = editingKey === key;
                            const wasEdited = isEdited(message);
                            // One receipt per author block, on its last message — the same
                            // place the group's own timestamp belongs to. Per-message
                            // receipts would stack four identical lines under a burst of
                            // four messages sent a second apart. A message still in flight,
                            // failed or deleted has no meaningful count.
                            const isLastInGroup = i === group.messages.length - 1;
                            const receipt: ReadCount | null =
                                receiptRead != null && isLastInGroup && isSettled && !message.hidden && message.chatNo
                                    ? { readCount: receiptRead, unreadCount: receiptUnread ?? 0 }
                                    : null;
                            // Keep the toolbar up whenever it owns something the reader is
                            // still looking at — the emoji grid, the delete dialog, or the
                            // "Copied" tick that has not timed out yet. All three outlive the
                            // hover that opened them.
                            const isToolbarPinned =
                                isCopied || pickerKey === key || menuKey === key || confirmingKey === key;
                            // What Save is allowed to do. An edit to nothing is a delete
                            // everywhere else and would only blank the row here, and an edit
                            // to the same text is a no-op — so neither is offered. Disabling
                            // the button says that; silently ignoring the keypress did not.
                            const trimmedDraft = draft.trim();
                            const isEditDirty = !!trimmedDraft && trimmedDraft !== content;
                            const cancelEdit = () => setEditingKey(null);
                            // Enter and the Save button share this so the two can never drift.
                            const saveEdit = () => {
                                setEditingKey(null);
                                if (isEditDirty && message.id) editMessage(message.id, trimmedDraft);
                            };
                            return (
                                // Reserve the toolbar slot: both actions in the main feed, copy
                                // only in the (narrower) thread panel — a full 80px reserve there
                                // wastes scarce width.
                                <div
                                    key={key}
                                    data-chat-no={message.chatNo}
                                    tabIndex={0}
                                    role="article"
                                    aria-label={msgTime ? `${group.ownerName}, ${msgTime}` : group.ownerName}
                                    onMouseEnter={() => setHoverKey(key)}
                                    onMouseLeave={() => setHoverKey(curr => (curr === key ? null : curr))}
                                    onFocus={() => setFocusKey(key)}
                                    onBlur={e => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                            setFocusKey(curr => (curr === key ? null : curr));
                                        }
                                    }}
                                    className={cn(
                                        'group/msg relative rounded-md outline-none transition-colors ease-tactile focus-visible:ring-2 focus-visible:ring-ring',
                                        onOpenThread ? 'pr-20' : 'pr-12',
                                        message.chatNo != null &&
                                            message.chatNo === highlightChatNo &&
                                            'bg-primary/10 ring-1 ring-primary/40'
                                    )}
                                >
                                    {i > 0 && msgTime && (
                                        <span className="absolute -left-12 top-0.5 hidden w-10 text-right text-nano tabular-nums text-muted-foreground/70 group-hover/msg:block">
                                            {msgTime}
                                        </span>
                                    )}
                                    {message.hidden ? (
                                        // Every deleted message reads this way, in the feed and in
                                        // the thread panel alike. The row keeps its place in the
                                        // conversation and its author line, so what is missing is
                                        // the content, not the fact that somebody said something.
                                        <p className="whitespace-pre-wrap break-words text-body italic text-muted-foreground">
                                            {t('chat.deletedMessage')}
                                        </p>
                                    ) : editingKey === key ? (
                                        // The message becomes its own editor in place, so the
                                        // surrounding conversation stays readable while you fix a
                                        // typo. Capped to the reading measure rather than the pane:
                                        // a nine-character message in a window-wide field is hard to
                                        // scan and does not look like the message it replaces.
                                        <div className="flex max-w-prose flex-col gap-1.5">
                                            <textarea
                                                autoFocus
                                                rows={Math.min(8, draft.split('\n').length)}
                                                value={draft}
                                                onChange={e => setDraft(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        cancelEdit();
                                                        return;
                                                    }
                                                    if (e.key !== 'Enter' || e.shiftKey) return;
                                                    e.preventDefault();
                                                    saveEdit();
                                                }}
                                                aria-label={t('chat.edit')}
                                                aria-describedby={`${key}-edit-hint`}
                                                className="focus-ring w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-body text-foreground"
                                            />
                                            {/* Buttons and shortcuts both, deliberately. The
                                                shortcuts are faster once known and the buttons are
                                                how you find out — and how you leave the editor
                                                without taking your hand off the mouse. */}
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={saveEdit}
                                                    disabled={!isEditDirty}
                                                    className="h-9 px-3 text-caption"
                                                >
                                                    {t('chat.editSave')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={cancelEdit}
                                                    className="h-9 px-3 text-caption"
                                                >
                                                    {t('common.cancel')}
                                                </Button>
                                                <span
                                                    id={`${key}-edit-hint`}
                                                    className="text-micro text-muted-foreground"
                                                >
                                                    {t('chat.editHint')}
                                                </span>
                                            </div>
                                        </div>
                                    ) : blocks ? (
                                        // Block Kit owns its own layout, so it replaces the <p>
                                        // rather than sitting inside one: a header or a divider
                                        // nested in a paragraph is invalid markup and the browser
                                        // would close the <p> out from under the rest of the row.
                                        <div className={cn(isPending && 'opacity-50')}>
                                            <BlockKitMessage
                                                blocks={blocks}
                                                raw={content}
                                                renderFallback={raw => (
                                                    <RichText
                                                        content={raw}
                                                        selfNames={selfNames}
                                                        resolveMention={resolveMention}
                                                    />
                                                )}
                                            />
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
                                            <RichText
                                                content={content}
                                                selfNames={selfNames}
                                                resolveMention={resolveMention}
                                            />
                                            {wasEdited && (
                                                <Hint label={t('chat.editedTitle')}>
                                                    <span className="ml-1 align-baseline text-micro text-muted-foreground">
                                                        {t('chat.edited')}
                                                    </span>
                                                </Hint>
                                            )}
                                        </p>
                                    )}
                                    {/* Images sit under the text (Figma: "when text and image upload
                                        together, the text shows above"). A tombstone or an open editor has none. */}
                                    {message.id && !message.hidden && !isEditing && (
                                        <MessageImages
                                            messageId={message.id}
                                            canDelete={group.isMine}
                                            author={{
                                                name: group.ownerName,
                                                avatar: group.avatar,
                                                colorSeed: group.colorSeed,
                                                time: formatTime(
                                                    message.createdAt ?? message.createdAtMs ?? group.timestamp
                                                ),
                                            }}
                                            onReply={onOpenThread && (() => onOpenThread(threadRootId(message)))}
                                        />
                                    )}
                                    {failure?.id === message.id && (
                                        <span className="mt-0.5 block text-caption text-destructive">
                                            {failure.kind === 'delete' ? t('chat.deleteFailed') : t('chat.editFailed')}
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
                                    {receipt && (
                                        <ReadReceipt readCount={receipt.readCount} unreadCount={receipt.unreadCount} />
                                    )}
                                    {/* Slack-style action toolbar: an elevated pill at a FIXED
                                    far-right position (spatial muscle memory), aligned with the
                                    message's first line so it stays inside the hover band. It
                                    slides in on hover — peripheral vision picks up the motion
                                    onset where a static pill goes unnoticed on wide windows.

                                    Gone while the editor is open. Leaving it up offered Delete
                                    beside a draft in progress, and gave the row two competing
                                    sets of controls with no sign which one was live.

                                    Gone on a tombstone too: there is nothing left to react to,
                                    save, or copy, and `content` often survives the soft delete —
                                    so Copy would hand back the text the row is telling you is
                                    gone. The thread footer below stays, which is what keeps a
                                    deleted root's replies reachable.

                                    Pinned open while something it opened is still on screen.
                                    Radix portals the picker and the dialog out of this row, so
                                    moving the pointer into either one ends `group-hover` and
                                    `focus-within` never applies — the toolbar would vanish out
                                    from under the control the reader is using. Slack keeps the
                                    pill above the open picker for the same reason: it is the
                                    only thing still tying the grid to the message it acts on. */}
                                    {!isEditing && !message.hidden && ((onOpenThread && isSettled) || content) && (
                                        <div
                                            inert={
                                                CAN_HOVER && !isToolbarPinned && hoverKey !== key && focusKey !== key
                                            }
                                            className={cn(
                                                'absolute -top-10 right-0 z-10 flex items-center gap-0.5 rounded-lg border border-hairline bg-elevated p-0.5 shadow-overlay transition-[opacity,transform] duration-150 ease-tactile motion-reduce:transition-none motion-reduce:translate-x-0',
                                                isToolbarPinned
                                                    ? 'translate-x-0 opacity-100'
                                                    : 'translate-x-0 opacity-100 focus-within:translate-x-0 focus-within:opacity-100 [@media(hover:hover)]:translate-x-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:translate-x-0 [@media(hover:hover)]:group-hover/msg:opacity-100 [@media(hover:hover)]:focus-within:translate-x-0 [@media(hover:hover)]:focus-within:opacity-100'
                                            )}
                                        >
                                            {/* One-click reactions. Reacting is the most frequent
                                                thing anyone does to a message, and routing it
                                                through a grid every time costs two clicks and
                                                covers the conversation while you hunt.

                                                Always the same two, in the same order — see
                                                QUICK_REACTIONS. A row that reorders itself has to
                                                be read before it can be used, which is the cost
                                                these buttons exist to remove. */}
                                            {isSettled &&
                                                QUICK_REACTIONS.map(emoji => (
                                                    <ToolbarButton
                                                        key={emoji}
                                                        label={t('chat.reaction.quick', { emoji })}
                                                        pressed={hasMyReaction(tallies, emoji)}
                                                        className={cn(
                                                            'text-base leading-none hover:bg-accent',
                                                            hasMyReaction(tallies, emoji) && 'bg-accent'
                                                        )}
                                                        onClick={() => {
                                                            remember(emoji);
                                                            if (message.id) {
                                                                toggleReaction(
                                                                    message.id,
                                                                    emoji,
                                                                    hasMyReaction(tallies, emoji)
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <span aria-hidden>{emoji}</span>
                                                    </ToolbarButton>
                                                ))}
                                            {isSettled && (
                                                <Popover
                                                    open={pickerKey === key}
                                                    onOpenChange={next => setPickerKey(next ? key : null)}
                                                >
                                                    <Hint label={t('chat.reaction.add')}>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                aria-label={t('chat.reaction.add')}
                                                                className={cn(
                                                                    TOOLBAR_BUTTON,
                                                                    'hover:bg-accent hover:text-foreground'
                                                                )}
                                                            >
                                                                <SmilePlus size={16} />
                                                            </button>
                                                        </PopoverTrigger>
                                                    </Hint>
                                                    <PopoverContent
                                                        align="end"
                                                        side="top"
                                                        className="w-auto p-2"
                                                        // Radix hands focus back to the trigger on close,
                                                        // which lights `focus-within` and leaves the whole
                                                        // toolbar hanging over a message the pointer left
                                                        // long ago. Only take that back when the close came
                                                        // from a pick — Escape still returns focus, which is
                                                        // what a keyboard user is asking for.
                                                        onCloseAutoFocus={event => {
                                                            if (!pickedRef.current) return;
                                                            pickedRef.current = false;
                                                            event.preventDefault();
                                                        }}
                                                    >
                                                        {/* Picking one you already used turns it off,
                                                            rather than publishing a second redundant `on`
                                                            the fold would dedupe. `hasMyReaction`
                                                            normalises first, so a picker that emits `❤️`
                                                            still matches a stored `❤`. */}
                                                        <EmojiPicker
                                                            onPick={emoji => {
                                                                pickedRef.current = true;
                                                                setPickerKey(null);
                                                                if (message.id) {
                                                                    toggleReaction(
                                                                        message.id,
                                                                        emoji,
                                                                        hasMyReaction(tallies, emoji)
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            )}
                                            {onOpenThread && isSettled && (
                                                <ToolbarButton
                                                    label={t('chat.thread.replyAction')}
                                                    onClick={() => onOpenThread(threadRootId(message))}
                                                    className="hover:bg-accent hover:text-foreground"
                                                >
                                                    <Reply size={16} />
                                                </ToolbarButton>
                                            )}
                                            {/* Everything past Reply lives in one menu. Eight
                                                same-sized icons made a strip nobody could aim at,
                                                each one its own tab stop, and Delete sat a
                                                mouse-width from Edit. The three frequent actions
                                                stay out here; the rest are named in a list, where
                                                a label is cheaper to read than an icon. */}
                                            {(content || canModifyMessage(message, group.isMine)) && (
                                                <DropdownMenu
                                                    open={menuKey === key}
                                                    onOpenChange={next => setMenuKey(next ? key : null)}
                                                >
                                                    <Hint label={t('chat.more')}>
                                                        <DropdownMenuTrigger asChild>
                                                            <button
                                                                type="button"
                                                                aria-label={t('chat.more')}
                                                                className={cn(
                                                                    TOOLBAR_BUTTON,
                                                                    'hover:bg-accent hover:text-foreground'
                                                                )}
                                                            >
                                                                <MoreHorizontal size={16} />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                    </Hint>
                                                    <DropdownMenuContent align="end" side="bottom" className="w-48">
                                                        {content && isSettled && (
                                                            <DropdownMenuItem
                                                                onSelect={() =>
                                                                    toggleSaved({
                                                                        id: key,
                                                                        channelId: message.channelId ?? '',
                                                                        chatNo: message.chatNo,
                                                                        content: plain,
                                                                        ownerName: group.ownerName,
                                                                        avatar: group.avatar,
                                                                        colorSeed: group.colorSeed,
                                                                        ownerId: group.ownerId,
                                                                        placeId: currentPlaceId(),
                                                                        parentId: message.parentId,
                                                                    })
                                                                }
                                                            >
                                                                <Bookmark
                                                                    size={14}
                                                                    aria-hidden
                                                                    className={
                                                                        isSavedKey(key)
                                                                            ? 'fill-current text-primary-ink'
                                                                            : undefined
                                                                    }
                                                                />
                                                                {isSavedKey(key) ? t('chat.unsave') : t('chat.save')}
                                                            </DropdownMenuItem>
                                                        )}
                                                        {content && (
                                                            <DropdownMenuItem onSelect={() => copy(key, plain)}>
                                                                {isCopied ? (
                                                                    <Check
                                                                        size={14}
                                                                        aria-hidden
                                                                        className="text-primary-ink"
                                                                    />
                                                                ) : (
                                                                    <Copy size={14} aria-hidden />
                                                                )}
                                                                {isCopied ? t('chat.copied') : t('chat.copy')}
                                                            </DropdownMenuItem>
                                                        )}
                                                        {canModifyMessage(message, group.isMine) && (
                                                            <>
                                                                {/* No Edit on a Block Kit message, whichever way
                                                                    the blocks arrived. From `content` JSON, the
                                                                    editor is a plain textarea and would hand back
                                                                    the payload to edit by hand. From `blocks$`,
                                                                    `content` is only the server's summary —
                                                                    editing it would leave the card saying one
                                                                    thing and the summary another, and the server
                                                                    does not rebuild `blocks$` on update
                                                                    (knowledge#319 SPEC §4.3). Delete still
                                                                    applies: the message can still be wrong. */}
                                                                {!blocks && (
                                                                    <DropdownMenuItem
                                                                        onSelect={() => {
                                                                            setDraft(content);
                                                                            setEditingKey(key);
                                                                        }}
                                                                    >
                                                                        <Pencil size={14} aria-hidden />
                                                                        {t('chat.edit')}
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuSeparator />
                                                                {/* Last, behind a rule, and the only item that
                                                                    cannot be undone. */}
                                                                <DropdownMenuItem
                                                                    onSelect={() => setConfirmingKey(key)}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 size={14} aria-hidden />
                                                                    {t('chat.delete')}
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    )}
                                    {/* Delete is a soft delete on the server, but nothing in this
                                        client can bring the message back, and the control sits in a
                                        row of five benign ones. The dialog quotes the message so the
                                        answer is about *this* message, not "delete something?". */}
                                    {confirmingKey === key && (
                                        <ConfirmDialog
                                            open
                                            onOpenChange={next => !next && setConfirmingKey(null)}
                                            title={t('chat.deleteConfirm.title')}
                                            description={plain || t('chat.deleteConfirm.noPreview')}
                                            confirmLabel={t('chat.deleteConfirm.action')}
                                            onConfirm={() => {
                                                setConfirmingKey(null);
                                                if (message.id) deleteMessage(message.id);
                                            }}
                                        />
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
                                                                className="rounded text-nano font-semibold"
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
    },
    (prev, next) => {
        // `reactions` and `threadMeta` are whole-feed maps rebuilt on every message
        // change, so a default shallow compare re-rendered every row whenever any
        // one message changed. Everything else compares by identity as before;
        // those two compare only the entries this block actually reads.
        for (const k of Object.keys(next) as (keyof MessageRowProps)[]) {
            if (k === 'reactions' || k === 'threadMeta' || k === 'group') continue;
            if (prev[k] !== next[k]) return false;
        }
        // The group object is rebuilt on every feed change too; what matters is
        // its fields and the identity of each message in it (the repository
        // hands back a new object only for a message that actually changed).
        if (!sameGroup(prev.group, next.group)) return false;
        for (const message of next.group.messages) {
            if (message.id && !sameEntry(prev.reactions?.get(message.id), next.reactions?.get(message.id))) {
                return false;
            }
            if (message.chatNo != null) {
                const no = String(message.chatNo);
                if (!sameEntry(prev.threadMeta?.get(no), next.threadMeta?.get(no))) return false;
            }
        }
        return true;
    }
);

MessageRow.displayName = 'MessageRow';
