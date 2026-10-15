import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
import { canModifyMessage, isInJoinWindow } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { ChatRoomHeader, DefaultAvatar, ImageAvatar, MessageInput } from '@chatic/web-ui-kit';

import { ChannelMessageRow, type MessageSender } from '../components/ChannelMessageRow';
import { useChatImageAttach } from '../components/ChatImageAttach';
import { COMPOSER_PADDING_BOTTOM } from '../hooks/useAttachPanelSlot';
import { useComposerDraft } from '../hooks/useComposerDraft';
import { useMentionComposer } from '../hooks/useMentionComposer';
import { MentionSuggestions } from '../components/MentionSuggestions';
import { mentionMarksFor, mentionViewerOf } from '../utils/mentionHighlight';
import { buildMentionCandidates } from '../utils/mentionInput';
import { useSendImages } from '../hooks/useSendImages';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReactionChips } from '../components/ReactionChips';
import { MessageText } from '../components/MessageText';
import { MessageImages } from '../components/MessageImages';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { MessageDetailDialog } from '../components/MessageDetailDialog';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelProfiles,
    useChatMutations,
    useMessageEditing,
    useMessageJump,
    useChats,
    useReactions,
} from '../hooks';
import { channelKindOf, profilePlaceOf } from '../lib';
import type { ClientChatView, DomainChat } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { canOpenMessageActions, hasMessageText } from '../utils/messageActions';
import { deleteConfirmQuote, messagePlainText } from '../utils/messagePlainText';
import { isSendKey } from '../utils/composerEnter';
import { resolveChatOwnerName, resolveUserName, type DisplayNameSources } from '../utils/displayName';
import { buildThread } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { toCloudId } from '../../../hooks/useCloudScope';

const MAX_INPUT_LENGTH = 5000;

/** px the reply list keeps clear above the composer, on top of the composer's own height. */
const LIST_COMPOSER_GAP = 16;

/** How close to the bottom the reader has to scroll for the newest-reply follow to come back. */
const FOLLOW_RESUME_PX = 80;

/**
 * The list's bottom padding for a composer `height` px tall, written straight onto the list, with the
 * newest reply kept in view — for the frames the composer moves without the page rendering them
 * (`followFooter`).
 */
const clearComposer = (list: HTMLElement | null, height: number) => {
    if (!list) return;
    list.style.paddingBottom = `${height + LIST_COMPOSER_GAP}px`;
    list.scrollTo({ top: list.scrollHeight });
};

/**
 * Full-screen thread: one root message and its direct replies (ADR-0093 decision 4).
 *
 * Everything here is derived from the channel's loaded cache window (`rawChats` →
 * `buildThread`), so the reply list is best-effort (ADR-0008): an old thread is reached by
 * widening the window to its root from the cache, and only a root the cache never held needs
 * the channel history paged in before it and its older replies appear. Replies send with
 * `parentId: root.id` — the FULL `<channelId>:<chatNo>` id; the server 404s a bare
 * chatNo. Threads are flat: the action sheet here never offers "reply".
 */
export const ThreadPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { channelId, rootNo } = useParams<{ channelId: string; rootNo: string }>();
    /**
     * The root message handed over by the room (see its `openThread`). The cache's first emission
     * is asynchronous even when it is warm, so without this the thread opens on a spinner and the
     * glass header sits over nothing. Absent on a deep link or a reload — then the spinner is
     * honest, because there really is nothing yet.
     */
    const seededRoot = (useLocation().state as { rootChat?: DomainChat } | null)?.rootChat;
    const stableChannelId = channelId || 'default';
    // This thread's own conversation for the composer's draft and its waiting files — not the room's.
    const draftScope = `${stableChannelId}#${rootNo ?? ''}`;

    // The composer's text is this thread's draft: kept when the thread is left, and swapped when the
    // route moves to another thread without remounting.
    const [content, setContent] = useComposerDraft(draftScope);
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    // A truncated reply's "view full" target (null = closed) — the room's dialog, same rule.
    const [expandedMessage, setExpandedMessage] = useState<{ content: string } | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    // The chip whose reactors are being inspected (message id + long-pressed fold key).
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    // The room's profile rule: the last person opened, kept while the dialog slides away.
    const [profileTarget, setProfileTarget] = useState<MessageSender | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    // The mention composer's way to put back the picks of a caption that came back unsent. The attach
    // flow is set up before the composer is, so it reaches the composer through this ref.
    const restoreCaptionPicksRef = useRef<(() => void) | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const {
        headerRef,
        footerRef: composerRef,
        headerHeight,
        footerHeight: composerHeight,
        followFooter: followComposer,
    } = useChromeInsets();

    // A thread is a view of a channel, so it names people the way the room does — see `profilePlaceOf`.
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { channel } = useChannel(channelId || null);
    // "Me" is the uid this account has in the thread's own cloud, as in the room: every comparison
    // below is against ids that cloud minted, and during a switch the session uid is another cloud's.
    const threadCid = toCloudId(channel?.cid || selectedCloudId);
    const userId = runtime.session.useUidInCloud(threadCid);
    // One join subscription for the screen — the roster rows and the active-member set are two
    // readings of it (see useChannelJoins). A thread and its room are two views of one channel, so
    // they compose the same way. `myJoin` is read for its `joinedNo` only — the title it used to
    // feed is gone with the channel name from the header (see below).
    const { joins, myJoin, activeMemberIds } = useChannelJoins(channelId || null);
    const { members } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
        joins,
    });
    const { profileMap } = useChannelProfiles(profilePlaceOf(channel, selectedSiteId), activeMemberIds);

    // The header names the SCREEN ("Thread"), not the room (Figma 4718:22183) — a thread is a
    // view of a channel, and wearing the channel's name and face would claim otherwise. So no
    // channel title, no channel avatar, and with them go the peer/title chains this screen used
    // to run purely to feed the header. `members` / `profileMap` above stay: they are what give
    // the root and its replies their names and faces.

    // `joinedNo` windows the cache to my CURRENT membership, exactly as the room does. A thread is
    // another view of the same channel, so it has to ask the same question — and it was not: rows
    // from before a leave survive in the local cache (the sync plan keeps them on purpose), so an
    // unwindowed read here showed, inside a thread, the very history the room had just hidden.
    // ADR-0067's rule is one rule for every surface; a second surface does not get a second
    // reading of it.
    const chatParams = useMemo(
        () => ({ channelId: stableChannelId, limit: 100, joinedNo: myJoin?.joinedNo }),
        [stableChannelId, myJoin?.joinedNo]
    );
    const { rawChats, isLoading, hasMore, isLoadingMore, loadMore, canLoadMore, loadUntil, fetchThrough, isFetched } =
        useChats(chatParams);

    /**
     * Is the root this URL names from before my current membership?
     *
     * `rootNo` IS the chat number, so this is decidable without the row — which matters, because
     * the row is exactly what will never arrive. Reachable in one tap: somebody replies, after my
     * re-join, to a message from before it. Their reply is inside my window and carries a thread
     * footer, and the thread it opens has a root I am not entitled to see.
     *
     * Without this the screen falls into its generic "not loaded yet" branch, which says the
     * message will appear once older history is fetched and offers a button to fetch it. Both are
     * untrue here: the cache is windowed by the same cursor and the server stops serving below it,
     * so the button can only ever spin.
     */
    const rootOutsideJoinWindow = useMemo(() => {
        const parsed = Number(rootNo);
        if (!Number.isInteger(parsed) || parsed <= 0) return false;
        return !isInJoinWindow({ chatNo: parsed }, myJoin?.joinedNo);
    }, [rootNo, myJoin?.joinedNo]);
    const { sendMessage } = useChatMutations();
    const editing = useMessageEditing(`${stableChannelId}/${rootNo ?? ''}`);
    const { toggleReaction, failedId } = useReactions();
    const remember = useRecentEmojiStore(s => s.remember);

    const thread = useMemo(() => buildThread(rawChats, rootNo ?? ''), [rawChats, rootNo]);
    const hasRoot = !!thread.root;

    // An old thread's root sits below the newest-rows window. The cache usually holds it — the
    // reader scrolled past it once, or a search found it there — so the window is widened to reach
    // it before anyone is asked to page the server. The root is the thread's oldest row, so a window
    // that reaches it also holds every reply. `loadUntil` is a no-op once the window covers that far,
    // and the effect re-runs as rows arrive because a cold cache answers after the first render.
    //
    // A window that already reaches that far and still has no root means the cache never held it: the
    // root sits in a gap. Older pages cannot reach it — they only ever ask below the oldest cached row
    // — so the page starting at the root is asked for directly: by itself once per thread, then by
    // the "load older" button, until a page answers for that number (then the root was deleted).
    const rootNumber = Number(rootNo);
    const rootUnfetched =
        !hasRoot && !rootOutsideJoinWindow && Number.isInteger(rootNumber) && rootNumber > 0 && !isFetched(rootNumber);
    const [isFetchingRoot, setIsFetchingRoot] = useState(false);
    const askedRootRef = useRef<number | null>(null);
    const fetchRootPage = useCallback(() => {
        setIsFetchingRoot(true);
        fetchThrough(rootNumber)
            .catch(() => undefined)
            .finally(() => setIsFetchingRoot(false));
    }, [fetchThrough, rootNumber]);
    useEffect(() => {
        if (hasRoot || rootOutsideJoinWindow) return;
        if (!Number.isInteger(rootNumber) || rootNumber <= 0) return;
        if (loadUntil(rootNumber) || isLoading || !rootUnfetched || !canLoadMore) return;
        // Once by itself: a failure retried on every arriving message would hammer a failing socket.
        if (askedRootRef.current === rootNumber) return;
        askedRootRef.current = rootNumber;
        fetchRootPage();
    }, [
        hasRoot,
        rootNumber,
        rootOutsideJoinWindow,
        loadUntil,
        rawChats,
        isLoading,
        rootUnfetched,
        canLoadMore,
        fetchRootPage,
    ]);

    // A search hit on a reply opens here with `?chatNo=` — the room's convention, and stripped the
    // same way so a reload does not jump again. The request names this thread, so the room this
    // page sits on does not take it for its own.
    const [searchParams, setSearchParams] = useSearchParams();
    // The newest-reply follow (below) stays off once a jump is asked for: rows still landing — the
    // composer measuring itself, a reply arriving — would otherwise pull the list back down past the
    // reply that was jumped to. It comes back when the reader returns to the bottom, writes a reply,
    // or the jump gives up, and a move to another thread on this same mounted page starts clean.
    const followHeldRef = useRef(false);
    useEffect(() => {
        followHeldRef.current = false;
    }, [rootNo]);
    useEffect(() => {
        const raw = searchParams.get('chatNo');
        if (!raw || !channelId || !rootNo) return;
        const chatNo = Number(raw);
        if (!Number.isInteger(chatNo) || chatNo <= 0) return;

        followHeldRef.current = true;
        useMessageJumpStore.getState().request(channelId, chatNo, { threadRootNo: rootNo });
        setSearchParams(
            // A copy, for the room's reason (see its `?chatNo=` effect).
            params => {
                const next = new URLSearchParams(params);
                next.delete('chatNo');
                return next;
            },
            { replace: true }
        );
    }, [searchParams, channelId, rootNo, setSearchParams]);
    // Photos reply to the root like text does — by its full id. Until the root is loaded there is no
    // id to reply to, and a send without one would land in the main feed, so the button stays locked.
    // Photos reply to the root's cloud first, like a text reply does (see handleSend).
    const imageSend = useSendImages({
        cid: toCloudId(thread.root?.cid || threadCid),
        channelId: stableChannelId,
        parentId: thread.root?.id,
    });
    const attach = useChatImageAttach({
        sendImages: imageSend.sendImages,
        disabled: editing.isEditing || rootOutsideJoinWindow || !thread.root?.id,
        // The route keeps this page mounted from one thread to the next; what waits is this thread's.
        scope: draftScope,
        inputRef,
        composerRef,
        // The room's rule: through the attach panel's slide the list follows the composer frame by
        // frame without a render — clearing it, and keeping the newest reply in view as the effect
        // below does once the composer has settled.
        onComposerSlide: sliding => followComposer(sliding ? height => clearComposer(listRef.current, height) : null),
        // Same as the room: a caption whose photos all failed the check comes back to an empty field.
        onUnsentText: text => {
            setContent(current => (current.trim() ? current : text));
            restoreCaptionPicksRef.current?.();
        },
    });
    // Reactions fold from the UNFILTERED window — the events are hidden rows in it.
    const reactions = useMemo(() => foldReactions(rawChats, userId ?? null), [rawChats, userId]);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    // The one naming chain (see resolveChatOwnerName) — a thread and its room are two views of
    // one channel, so a person cannot be named differently across the hop. It matters more here
    // than in the room: the root ALWAYS shows its author, so a chain that fell through to the raw
    // user id put a UUID at the top of the screen.
    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, userId, t]
    );
    const displayNameOf = useMemo(() => (chat: DomainChat) => resolveChatOwnerName(chat, nameSources), [nameSources]);
    const nameOfUser = useMemo(() => (id: string) => resolveUserName(id, nameSources), [nameSources]);

    // Same precedence for faces as for names — the reactor sheet's avatars must match the
    // bubbles they were opened from.
    const avatarOfUser = useMemo(
        () => (id: string) => profileMap.get(id)?.thumbnail ?? memberById.get(id)?.thumbnail,
        [profileMap, memberById]
    );

    // The room's `@` lookup, on the room's terms: a group room's alone, the same rows the room offers.
    const isGroupChat = !!channel && channelKindOf(channel.stereo) === 'group';
    const mentionCandidates = useMemo(
        () =>
            isGroupChat
                ? buildMentionCandidates({
                      memberIds: activeMemberIds,
                      me: userId,
                      nameOf: nameOfUser,
                      avatarOf: avatarOfUser,
                      unknownLabel: t('chat.unknownUser'),
                      everyoneKeyword: t('chat.mention.everyone'),
                      everyoneLabel: t('chat.mention.everyoneWord'),
                  })
                : [],
        [isGroupChat, activeMemberIds, userId, nameOfUser, avatarOfUser, t]
    );
    const mentionComposer = useMentionComposer({
        enabled: isGroupChat,
        candidates: mentionCandidates,
        content,
        setContent,
        inputRef,
        scope: draftScope,
    });
    useEffect(() => {
        restoreCaptionPicksRef.current = mentionComposer.restoreClearedPicks;
    }, [mentionComposer.restoreClearedPicks]);

    // Me as a mention needs me — the room's rule: both of my ids, and every name I could be written by.
    const { userId: sessionUid } = runtime.session.useSessionIdentity();
    const mentionViewer = useMemo(() => {
        const me = userId ? memberById.get(userId) : undefined;
        const names = [userId ? profileMap.get(userId)?.nick : undefined, me?.nick, me?.name];
        // Every member's `@name` is drawn as a mention, by the name the list writes it with.
        const memberNames = isGroupChat
            ? [
                  ...mentionCandidates.filter(row => !row.everyone).map(row => row.label),
                  userId ? nameOfUser(userId) : undefined,
              ]
            : undefined;
        // A mention opens the member it names, by the same row the list offers.
        const people = mentionCandidates
            .filter(row => !row.everyone)
            .map(row => ({ id: row.id, name: row.label, avatar: row.thumbnail }));
        return mentionViewerOf({ roomUid: userId, sessionUid, names, memberNames, people });
    }, [userId, sessionUid, memberById, profileMap, isGroupChat, mentionCandidates, nameOfUser]);

    const toClientView = useMemo(
        () =>
            (chat: DomainChat): ClientChatView => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === userId,
                isSystem: chat.stereo === 'system',
                ownerName: displayNameOf(chat),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }),
        [userId, displayNameOf]
    );

    // The cache wins once it has the row: it carries later edits and the tombstone flag, which a
    // snapshot taken at navigation time cannot.
    const rootSource = thread.root ?? seededRoot;
    const root = rootSource ? toClientView(rootSource) : undefined;
    const replies = useMemo(() => thread.replies.map(toClientView), [thread.replies, toClientView]);

    // Keep the newest reply in view — a thread is a linear column, newest at the bottom.
    useEffect(() => {
        if (followHeldRef.current) return;
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [replies.length, composerHeight]);

    // A jump that found nothing leaves no reply to stay on, so the thread opens as it always does.
    const resumeFollow = useCallback(() => {
        followHeldRef.current = false;
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, []);
    const handleListScroll = useCallback(() => {
        const list = listRef.current;
        if (!followHeldRef.current || !list) return;
        if (list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_RESUME_PX) {
            followHeldRef.current = false;
        }
    }, []);

    // Declared after the follow above so that, in the commit where the reply appears, its scroll
    // runs last. Same budget and toasts as the room; `threadRootNo` keeps it to this thread's target.
    useMessageJump({
        channelId: stableChannelId,
        containerRef: listRef,
        messages: replies,
        hasMore,
        isLoadingMore,
        loadMore,
        // Not before the first cache read: with no rows there is no cursor, so a page "sent" then goes
        // nowhere and still spends the budget the jump needs once the rows are in.
        canLoadMore: canLoadMore && !isLoading,
        loadUntil,
        joinedNo: myJoin?.joinedNo,
        threadRootNo: rootNo,
        onGiveUp: resumeFollow,
        isFetched,
        fetchThrough,
    });

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? t('chat.room.am') : t('chat.room.pm');
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const handleSend = (raw: string) => {
        // The reader is writing now, so the newest reply — theirs — is where the list belongs again.
        followHeldRef.current = false;
        const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);
        // Read at the press, and forgotten only once something is sent — see the room's handleSend.
        const mention = mentionComposer.mentionFor(trimmed);
        // Photos picked in the attach panel take the press, with the text as their caption — see the
        // room's handleSend. The panel only opens once the root is loaded, so they reply to it.
        if (attach.sendReady && attach.sendPicked(trimmed, mention)) {
            mentionComposer.clearPicks();
            setContent('');
            return;
        }
        // No root, no reply — the send needs the root's full id (bare chatNo 404s).
        if (!trimmed || !stableChannelId || !thread.root?.id) return;

        mentionComposer.clearPicks();
        setContent('');
        // The reply belongs to the root's cloud, read at the press — see the room's handleSend.
        const cid = toCloudId(thread.root.cid || threadCid);
        sendMessage(cid, {
            channelId: stableChannelId,
            content: trimmed,
            parentId: thread.root.id,
            ...(mention ? { mention } : {}),
        })
            .then(newChat => {
                // Replies consume channel chatNos; advance the read cursor like a room send, in the
                // cloud the reply went to. The outbox owns delivering it, so a failure is only logged.
                if (newChat?.chatNo) {
                    runtime.data
                        .getCloudRepositories(cid)
                        .join.readChat({ channelId: stableChannelId, chatNo: newChat.chatNo })
                        .then(receipt => receipt.delivered)
                        .catch(readError => {
                            logger.error('CHAT', 'Failed to read sent thread reply', {
                                error: readError,
                                data: { channelId: stableChannelId, cid },
                            });
                        });
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to send thread reply', {
                    error,
                    data: { channelId: stableChannelId, rootNo, cid },
                });
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isSendKey(e.nativeEvent)) return;
        e.preventDefault();
        handleSend(content);
    };

    const handleCopy = async () => {
        // What the message SAYS, not what it is made of — a Block Kit body would otherwise
        // put its payload on the clipboard.
        const text = messagePlainText(actionMessage?.content);
        if (!text || isCopying) return;
        setIsCopying(true);
        try {
            await copyMessageToClipboard(text);
            toast({ title: t('chat.room.messageCopied') });
            setActionMessage(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopying(false);
        }
    };

    const handlePickEmoji = (emoji: string) => {
        if (!actionMessage?.id) return;
        remember(emoji);
        // hasMyReaction matches on the normalised fold key — a display-string compare
        // would send a second `on` for an emoji differing only by variation selector.
        const mine = hasMyReaction(reactions.get(actionMessage.id), emoji);
        toggleReaction(actionMessage.id, emoji, mine);
        setActionMessage(null);
        setPickerOpen(false);
    };

    // Persisted rows only (chatNo > 0): an optimistic row's id is a temp id — a
    // reaction targeting it would 404 and orphan once the persisted swap lands.
    const canReact = !!actionMessage?.chatNo;

    // The same shared verdict the room uses. A reply and a root are both just messages here, so a
    // message I may edit in the feed is one I may edit in the thread — a surface must not hand out
    // a different answer about the same message.
    const canModify = !!actionMessage && canModifyMessage(actionMessage, actionMessage.isOwner);

    const handleEditAction = () => {
        const target = actionMessage;
        setActionMessage(null);
        if (target) editing.startEdit(target);
    };

    const handleDeleteAction = () => {
        const target = actionMessage;
        setActionMessage(null);
        if (target) editing.requestDelete(target);
    };

    const deleteConfirmPreview = deleteConfirmQuote(editing.deleteTarget?.content);

    // Chip-row add button — same one-step open as the room: set the target, show the picker.
    const handleAddReaction = (message: ClientChatView) => {
        setActionMessage(message);
        setPickerOpen(true);
    };

    // As in the room: never my own profile, whose "profile settings" editor this screen does not mount.
    const openMemberProfile = (sender: MessageSender) => {
        if (!sender.id || sender.id === userId) return;
        setProfileTarget(sender);
        setProfileOpen(true);
    };

    /**
     * The root, rendered as the thread's SUBJECT rather than as another message (Figma
     * 4722:22934): a 36px avatar and name on one line, then the body as plain 16px text with
     * no bubble and no side (when it has any), then its images, then its reaction chips.
     *
     * A bubble would put the root in the same visual class as the replies under it, and a
     * right-aligned bubble (when the root is mine) would put the thread's own subject off to
     * one side of the screen it opens. It also has no read receipt and no time of its own —
     * the room row it was opened from carries both, and repeating them here says nothing.
     *
     * A root another client soft-deleted is drawn the way the room draws the same row: the
     * shared deleted phrase and nothing of the original — not the text, which the row often
     * still carries, not the images and not the chips. The thread stays reachable, since its
     * replies are still a conversation, but its subject no longer says what was deleted.
     */
    const renderRoot = (message: ClientChatView) => {
        const avatarSrc = message.ownerId
            ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
            : undefined;
        const isDeleted = !!message.hidden;
        const tallies = !isDeleted && message.id ? reactions.get(message.id) : undefined;
        const rootAuthor = (
            <>
                {avatarSrc ? <ImageAvatar src={avatarSrc} alt="" size={36} /> : <DefaultAvatar size={36} />}
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[18px] tracking-[-0.075px] text-foreground">
                    {message.ownerName}
                </span>
            </>
        );
        return (
            <div data-testid="thread-root" className="flex flex-col px-3">
                {/* The subject's author opens their profile like a row's sender does; my own root
                    stays inert, as my rows do. */}
                {!message.isOwner && message.ownerId ? (
                    <button
                        type="button"
                        onClick={() =>
                            openMemberProfile({
                                id: message.ownerId as string,
                                name: message.ownerName,
                                avatar: avatarSrc,
                            })
                        }
                        aria-label={t('chat.room.openProfile', { name: message.ownerName })}
                        className="flex items-center gap-2.5 px-1 py-1.5 text-left"
                    >
                        {rootAuthor}
                    </button>
                ) : (
                    <div className="flex items-center gap-2.5 px-1 py-1.5">{rootAuthor}</div>
                )}
                <div className="flex flex-col gap-3 px-1 py-1.5">
                    {isDeleted ? (
                        <p className="text-base italic leading-normal tracking-[-0.08px] text-muted-foreground">
                            {t('chat.room.deletedMessage')}
                        </p>
                    ) : (
                        hasMessageText(message) && (
                            <p className="whitespace-pre-wrap break-words text-base leading-normal tracking-[-0.08px] text-foreground">
                                <MessageText
                                    text={messagePlainText(message.content)}
                                    mentions={mentionMarksFor(message, mentionViewer)}
                                    onMentionClick={person =>
                                        openMemberProfile({ id: person.id, name: person.name, avatar: person.avatar })
                                    }
                                    onPage
                                />
                            </p>
                        )
                    )}
                    {/* A photo can root a thread like a line of text can, and then the photo is the
                        subject — without it the page opens on a name over nothing. */}
                    {!isDeleted && (message.upload$$?.length ?? 0) > 0 && (
                        <MessageImages uploads={message.upload$$} chatId={message.id} cid={message.cid} align="start" />
                    )}
                    {tallies && tallies.length > 0 && (
                        <ReactionChips
                            tallies={tallies}
                            nameOf={nameOfUser}
                            onToggle={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
                            onAdd={message.chatNo ? () => handleAddReaction(message) : undefined}
                            onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
                        />
                    )}
                </div>
            </div>
        );
    };

    // Wrapped for `data-chat-no`, the anchor a jump looks for (useMessageJump).
    const renderRow = (message: ClientChatView) => (
        <div key={message.id} data-chat-no={message.chatNo}>
            <ChannelMessageRow
                message={message}
                mentionViewer={mentionViewer}
                showProfileAndName={!message.isOwner}
                showTimeAndStatus
                ownerDisplayName={message.ownerName}
                ownerAvatar={
                    message.ownerId
                        ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
                        : undefined
                }
                time={formatTime(message.timestamp)}
                read={{ show: false, isReady: false, readCount: 0, unreadCount: 0 }}
                onLongPress={() => canOpenMessageActions(message) && setActionMessage(message)}
                onExpand={() => setExpandedMessage({ content: messagePlainText(message.content) })}
                onRetry={() => undefined}
                onDelete={() => undefined}
                reactions={message.id ? reactions.get(message.id) : undefined}
                onToggleReaction={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
                reactionFailed={!!message.id && failedId === message.id}
                nameOf={nameOfUser}
                onAddReaction={message.chatNo ? () => handleAddReaction(message) : undefined}
                onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
                edit={editing.editStateFor(message)}
                onOpenProfile={openMemberProfile}
            />
        </div>
    );

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                {/* Titled for the screen, not the room, and with no avatar (Figma 4718:22183):
                    a thread is one conversation inside a channel, and the channel's face here
                    would read as having navigated to the channel. Back returns to it
                    (ADR-0093's two-hop). */}
                <ChatRoomHeader
                    title={t('chat.thread.title')}
                    hideAvatar
                    onBack={() => navigate(-1)}
                    className="border-b border-border"
                />
            </div>

            <div
                ref={listRef}
                onScroll={handleListScroll}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-none"
                style={{ paddingTop: headerHeight + 8, paddingBottom: composerHeight + LIST_COMPOSER_GAP }}
            >
                {isLoading && !root ? (
                    <div data-testid="thread-loading" className="flex min-h-full items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="flex flex-col px-0 py-2">
                        {root ? (
                            renderRoot(root)
                        ) : (
                            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
                                <span>
                                    {rootOutsideJoinWindow
                                        ? t('chat.thread.rootOutsideJoinWindow')
                                        : t('chat.thread.unavailable')}
                                </span>
                                {(hasMore || rootUnfetched) && !rootOutsideJoinWindow && (
                                    <button
                                        type="button"
                                        // A press is a person asking: sent at once, past a failed
                                        // page's retry wait. Disabled while the socket cannot carry
                                        // it, so a press is never silently dropped. A root in a gap is
                                        // asked for by its own page — the retry of the fetch above.
                                        onClick={() =>
                                            rootUnfetched ? fetchRootPage() : void loadMore({ immediate: true })
                                        }
                                        disabled={isLoadingMore || isFetchingRoot || !canLoadMore}
                                        className="text-primary underline"
                                    >
                                        {isLoadingMore || isFetchingRoot ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            t('chat.thread.loadOlder')
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                        {/* A full-bleed 4px band, not a hairline rule (Figma 4722:23017): it is
                            the seam between the thread's subject and the conversation about it,
                            which is a heavier boundary than the ones between messages. */}
                        <div className="py-4">
                            <div aria-hidden className="h-1 w-full bg-avatar-ring" />
                        </div>
                        {replies.length > 0 && (
                            <p className="px-4 py-1 text-[15px] font-semibold leading-normal tracking-[-0.075px] text-foreground">
                                {t('chat.thread.replyCount', { count: replies.length })}
                            </p>
                        )}
                        <div className="flex flex-col gap-3 pt-4">{replies.map(renderRow)}</div>
                    </div>
                )}
            </div>

            <div
                ref={composerRef}
                // The keyboard takes the attach panel's place: focusing the field closes the panel.
                onFocus={event => {
                    // React types a bubbled focus target as the element listening, which it need not be.
                    if ((event.target as EventTarget) === inputRef.current) attach.closePanel();
                }}
                // The room's rule: no transition — the keyboard moves it at once, the attach panel's slide
                // frame by frame.
                className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2"
                style={{
                    // The room's rule: above the keyboard or the attach panel in its place — the larger,
                    // while they trade places — else the home indicator. The list clears the composer
                    // by its measured height.
                    paddingBottom: COMPOSER_PADDING_BOTTOM,
                }}
            >
                {/* The room's rule: picked photos wait above the field, inside the measured bar. */}
                {attach.strip}
                {/* The room's rule: the `@` list right above the field, inside the measured bar. */}
                <MentionSuggestions candidates={mentionComposer.suggestions} onPick={mentionComposer.pick} />
                <MessageInput
                    value={content}
                    onChange={mentionComposer.onChange}
                    onSend={handleSend}
                    sendReady={attach.sendReady}
                    onKeyDown={handleKeyDown}
                    inputRef={inputRef}
                    placeholder={t('chat.thread.inputPlaceholder')}
                    // One live field at a time — same rule as the room. Also closed when the root
                    // is outside my window: a reply needs the root's full id, so `handleSend`
                    // would drop what was typed without saying anything.
                    disabled={editing.isEditing || rootOutsideJoinWindow}
                    leadingSlot={attach.button}
                />
            </div>
            {attach.overlays}

            <MessageDetailDialog message={expandedMessage} onClose={() => setExpandedMessage(null)} />

            {/* The room's profile, on the room's terms: view and report, no kick. */}
            {profileTarget && (
                <MemberProfileDialog
                    open={profileOpen}
                    onOpenChange={setProfileOpen}
                    member={profileTarget}
                    memberIsOwner={profileTarget.id === channel?.ownerId}
                    canKick={false}
                />
            )}

            <MessageActionSheet
                open={!!actionMessage && !pickerOpen}
                fileMessage={actionMessage}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                canReact={canReact}
                canReply={false}
                canModify={canModify}
                hasText={!!actionMessage && hasMessageText(actionMessage)}
                isCopying={isCopying}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setPickerOpen(true)}
                onCopy={() => void handleCopy()}
                onReply={() => undefined}
                onEdit={handleEditAction}
                onDelete={handleDeleteAction}
            />
            <ConfirmDialog
                open={!!editing.deleteTarget}
                onOpenChange={open => !open && editing.cancelDelete()}
                title={t('chat.room.deleteMessageTitle')}
                description={deleteConfirmPreview || t('chat.room.deleteMessageDescription')}
                confirmLabel={t('chat.room.deleteMessageConfirm')}
                onConfirm={() => void editing.confirmDelete()}
                isPending={editing.isDeleting}
                // Same as the room: the delete is not optimistic, so the dialog is the feedback.
                closeOnConfirm={false}
            />
            <ConfirmDialog
                open={editing.discardOpen}
                onOpenChange={open => !open && editing.setDiscardOpen(false)}
                title={t('chat.room.editDiscardTitle')}
                description={t('chat.room.editDiscardDescription')}
                confirmLabel={t('chat.room.editDiscardConfirm')}
                onConfirm={editing.closeEdit}
                variant="warning"
            />
            <ReactionDetailSheet
                open={!!reactorTarget}
                onOpenChange={open => !open && setReactorTarget(null)}
                tallies={(reactorTarget && reactions.get(reactorTarget.messageId)) || []}
                initialKey={reactorTarget?.key}
                nameOf={nameOfUser}
                avatarOf={avatarOfUser}
            />
            <EmojiPickerSheet
                open={pickerOpen}
                onOpenChange={open => {
                    setPickerOpen(open);
                    if (!open) setActionMessage(null);
                }}
                onPick={handlePickEmoji}
            />
        </div>
    );
};
