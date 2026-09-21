import { Loader2, Settings } from 'lucide-react';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { pushEntryRegistry } from '../../../runtime/logging/pushEntryRegistry';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { DropdownMenuItem } from '@chatic/ui-kit/components/ui/dropdown-menu';
import {
    AvatarGroup,
    ChatRoomHeader,
    DateDivider,
    DefaultAvatar,
    FloatingDateChip,
    ImageAvatar,
    MessageInput,
    SystemNotice,
} from '@chatic/web-ui-kit';

import { ChannelMessageRow } from '../components/ChannelMessageRow';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DmInviteFooter } from '../components/DmInviteFooter';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import { MessageDetailDialog } from '../components/MessageDetailDialog';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { RoomIntro } from '../components/RoomIntro';
import { RoomSkeleton } from '../components/RoomSkeleton';
import { channelKindOf, resolveChannelAvatar } from '../lib';
import { orderMemberIdsOwnerFirst } from '../utils/orderMemberIds';
import { pickDmPeerId } from '../utils/dmPeer';
import { isChannelMember, isNotMyChannel, isSomeoneElsesSelfChat } from '../utils/membership';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelProfiles,
    useChannelTitle,
    useChatMutations,
    useMessageEditing,
    useChats,
    useChatScroll,
    useDmInviteState,
    useDmPeer,
    useJoinPositions,
    useMessageJump,
    useReactions,
    useReadMarker,
} from '../hooks';
import type { ClientChatView } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { resolveUserName, type DisplayNameSources } from '../utils/displayName';
import { canModifyMessage } from '@chatic/data';
import { messagePlainText } from '../utils/messagePlainText';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { buildThreadIndex, countUnseenReplies } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { systemMessageSuffixKey } from '../utils/systemMessage';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { ROUTES } from '../../../routes/paths';

// Maximum number of characters allowed in the input
const MAX_INPUT_LENGTH = 5000;

export const ChannelRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const { channelId } = useParams<{ channelId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();

    // UI state management
    const [content, setContent] = useState('');
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    // The long-pressed message the action sheet targets (null = sheet closed).
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    // The chip whose reactors are being inspected: the message it belongs to plus the fold key
    // of the chip that was long-pressed (which tab the sheet opens on).
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopyingMessage, setIsCopyingMessage] = useState(false);

    // State for the floating pill that shows the date group crossing the top edge while scrolling
    const [floatingDate, setFloatingDate] = useState('');
    const [showFloatingDate, setShowFloatingDate] = useState(false);
    const floatingHideTimerRef = useRef<number | null>(null);

    // Ref for DOM access (the scroll container ref is owned by useChatScroll)
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Header/composer float as z-index overlays above the full-bleed message list (the translucent
    // glass treatment) instead of being flex-col siblings that push it down — the rest is corrected
    // via padding measured off their actual rendered height.
    const { headerRef, footerRef: composerRef, headerHeight, footerHeight: composerHeight } = useChromeInsets();

    const { userId } = runtime.session.useSessionIdentity();
    const { isGuest, isCloudActive } = runtime.session.useRuntimeProfile();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    // --- Data-fetching hooks ---
    const stableChannelId = useMemo(() => channelId || 'default', [channelId]);
    const stableChannelIdForChannelHook = useMemo(() => channelId || null, [channelId]);

    // The home row hands its channel across the navigation (ADR-0058) — same reason openThread
    // passes rootChat: the cache's first emission is asynchronous even when warm, and the header
    // showing a skeleton (or, under a congested bridge, the resolve-timeout error page) for a room
    // whose row was on screen a moment ago reads as a broken app. Display-only; useChannel keeps
    // resolution semantics on the observer.
    const seedChannel = (location.state as { channel?: DomainChannel } | null)?.channel ?? null;

    // Resolved before the member hook so its roster (`channel.memberIds`) can seed the member list —
    // the two have no dependency on each other beyond that.
    const {
        channel,
        isLoading: isChannelLoading,
        isError: isChannelError,
        isForbidden: isChannelForbidden,
    } = useChannel(stableChannelIdForChannelHook, { seed: seedChannel });

    // ONE join-cache subscription for this screen. My row (nick / notify / the read baseline), every
    // member's read cursor and the active-membership set are all readings of the same rows, and each
    // used to open its own observer of the same query (see useChannelJoins).
    const { joins, myJoin, activeMemberIds, cursorByUser } = useChannelJoins(stableChannelIdForChannelHook);

    // Loads member user identities (name/avatar fallback) and merges them with the join rows above.
    const { members } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
        joins,
        // A 1:1 keeps its departed peer on the roster — the header still names them and `useDmPeer`
        // still resolves, which is what the departure notice and the re-invite CTA hang off. The
        // stereo is read inline because this call sits above the `isDmChat` derivation.
        keepLeftMembers: channel?.stereo === 'dm',
    });

    // A 1:1's peer needs a profile target even after they leave, because the header keeps naming them
    // (Figma 4041-33606). `activeMemberIds` drops them, and while `profileMap` is the site-wide cache
    // — so a peer seen earlier stays resolvable — a cold cache would otherwise never fetch them and
    // the header would fall to "대화 상대" HERE while the settings screen (whose member list keeps
    // departed peers, so it registers them) shows the real name. Two screens, two answers, which is
    // exactly what ADR-0039 exists to prevent.
    //
    // The peer id is taken straight off the roster rather than from `useDmPeer`: that hook consumes
    // `profileMap`, so reading it here would be circular.
    const profileTargetIds = useMemo(() => {
        if (channel?.stereo !== 'dm') return activeMemberIds;
        const peerId = pickDmPeerId(channel.memberIds ?? [], userId);
        return peerId && !activeMemberIds.includes(peerId) ? [...activeMemberIds, peerId] : activeMemberIds;
    }, [channel?.stereo, channel?.memberIds, activeMemberIds, userId]);

    const { profileMap } = useChannelProfiles(channel?.sid ?? null, profileTargetIds);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    // The one naming chain (see resolveUserName) — the chip a11y labels and the reactor sheet
    // have to reach the same name the message rows do.
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
    const nameOfUser = useCallback((id: string) => resolveUserName(id, nameSources), [nameSources]);

    // Same precedence for faces as for names, so the thread footer's avatars match the
    // bubbles right above them (ADR-0047 decision 5). Returning undefined lets the footer
    // fall through to the reply row's embedded `owner$` thumbnail.
    const avatarOfUser = useCallback(
        (id: string) => profileMap.get(id)?.thumbnail ?? memberById.get(id)?.thumbnail,
        [profileMap, memberById]
    );

    // Full channel roster (source of truth: channel.memberIds), always including me. This drives
    // the per-member join sync registration so every participant's read cursor stays live — the
    // read-count denominator (activeMemberIds) is a separate, active-only set.
    const allMemberIds = useMemo(() => {
        const ids = new Set<string>(channel?.memberIds ?? []);
        if (userId) ids.add(userId);
        return [...ids];
    }, [channel?.memberIds, userId]);

    // Am I actually in this room? Read off the roster the server itself authorizes with, or my own
    // active join row. Gates the per-member join polling above: a room I am not in (a stale push
    // into somebody else's self-chat, a group URL I never joined) gets 403 per member otherwise.
    const isMember = isChannelMember(channel, myJoin, userId);

    const { getReadCount, isReady: isJoinReady } = useJoinPositions(
        stableChannelIdForChannelHook,
        activeMemberIds,
        allMemberIds,
        cursorByUser,
        isMember
    );

    // One reading of the room's kind for the whole screen, off `stereo` alone — never off the head
    // count, and never as `!self && !dm` (that negative form is what swallowed `public` elsewhere).
    // The booleans below are presentation flags derived FROM the kind, which is the shape this
    // screen is supposed to have; what is banned is deciding the kind at each use.
    const channelKind = channel ? channelKindOf(channel.stereo) : undefined;
    const isSelfChat = channel?.isSelfChat ?? false;
    // 1:1 DM. Header shows the peer's profile; no rename, no participant stack (ADR-0032).
    const isDmChat = channelKind === 'dm';
    // The header participant stack is group-only; self / 1:1 DM headers stay single-line.
    const isGroupChat = channelKind === 'group';
    // DM peer (the other participant) for the header title/avatar — resolved from the roster, nick
    // from the site profile only. Null for non-DM channels.
    const dmPeer = useDmPeer(channel, members, profileMap, userId);
    // `myJoin` (above, from the join cache stream) is NOT `channel.$join`, which is a projection that
    // lags the cache. The DM title reads the nick off it, so a rename in settings has to land here
    // immediately or the header disagrees with every other surface.
    // One title chain for every surface (see useChannelTitle): the header must read exactly what
    // the home list row reads, so neither the branch nor the fallback label lives here.
    const roomTitle = useChannelTitle(channel, { joinNick: myJoin?.nick, peerNick: dmPeer?.profileNick });
    // Whether there is still somebody on the other side, and where their invite stands (ADR-0068).
    // `present` for every non-DM room, and the invite read stands itself down there, so this costs a
    // group or self room nothing.
    const {
        state: dmInviteState,
        countdown: dmInviteCountdown,
        resolveReinvitePrefill,
    } = useDmInviteState({
        channelId: stableChannelId,
        isDm: isDmChat,
        peerId: dmPeer?.id,
        joins,
        channel,
        userId,
    });
    // One flag behind both the footer and the composer lock, so they cannot disagree about whether
    // there is anyone to talk to.
    const isPeerGone = dmInviteState.kind !== 'present';
    // Read receipts need somebody who can do the reading. Two conditions, and they are different
    // questions: a self chat never has a reader (kind), and a 1:1 whose peer is gone no longer has
    // one (state). The head count is not consulted for either — it used to carry both by accident,
    // reading 1 for a self chat and 1 again for an emptied 1:1, which is the same number standing
    // for two unrelated facts. `activeCount` survives as what it actually is: the denominator the
    // count-vs-tick mode is chosen by.
    const activeCount = activeMemberIds.length;
    const showReadReceipt = channelKind !== 'self' && !isPeerGone && activeCount >= 2;

    // `joinedNo` windows the feed to my CURRENT membership (ADR-0067) — cached rows from before a
    // leave stay in the chat cache, and the server stops serving them after a re-join.
    const memoizedChatParams = useMemo(
        () => ({
            channelId: stableChannelId,
            limit: 100,
            joinedNo: myJoin?.joinedNo,
        }),
        [stableChannelId, myJoin?.joinedNo]
    );

    const {
        messages,
        rawChats,
        isLoading: isChatLoading,
        isEmpty: isChatEmpty,
        isLoadingMore,
        isError: isChatError,
        hasMore,
        loadMore,
        loadUntil,
    } = useChats(memoizedChatParams);

    /**
     * Push-tap entry chain (ADR-0099). Only rooms reached by tapping a push record anything: the
     * registry hands over that push's id and how long the routing took, and the second effect closes
     * the chain when messages actually appear. Two entries, one correlation key — which is what makes
     * "tapped a push and the conversation never showed" answerable, by saying whether the room even
     * opened and whether it was routing or loading that took the time.
     */
    const pushEntryRef = useRef<{ messageId?: string } | null>(null);
    const pushReadyLoggedRef = useRef(false);
    useEffect(() => {
        if (!channelId) return;
        const pending = pushEntryRegistry.consume(channelId);
        if (!pending) return;
        pushEntryRef.current = { messageId: pending.messageId };
        logger.info('PUSH_EVENT', 'room opened from push tap', {
            messageId: pending.messageId,
            channelId,
            routingMs: pending.elapsedMs,
        });
    }, [channelId]);
    useEffect(() => {
        if (!pushEntryRef.current || pushReadyLoggedRef.current) return;
        if (isChatLoading || messages.length === 0) return;
        pushReadyLoggedRef.current = true;
        logger.info('PUSH_EVENT', 'push-opened room showed its messages', {
            messageId: pushEntryRef.current.messageId,
            channelId,
            count: messages.length,
        });
    }, [channelId, isChatLoading, messages]);

    /**
     * The room's very first message is loaded, so the intro block belongs at the top of the thread.
     *
     * `chatNo` is a per-channel sequence that starts at 1, so holding row 1 is proof we are at the
     * start rather than an inference from "nothing older came back" — which flipped around during
     * hydration and made the intro appear, move and disappear as pages landed. Once row 1 is in the
     * window it stays, so this only ever turns on. Read from the UNFILTERED window: row 1 is
     * typically the channel's own creation notice, which `messages` hides.
     */
    const hasThreadStart = useMemo(() => rawChats.some(chat => chat.chatNo === 1), [rawChats]);

    // Hold the room behind a skeleton until it can show its own name and its first messages. Either
    // half arriving alone is what produced the "unnamed channel" flash and the empty list under it.
    const isRoomLoading = isChannelLoading || isChatLoading;

    const { sendMessage, readMessage, deleteMessage } = useChatMutations();
    const editing = useMessageEditing(stableChannelId);
    const { toggleReaction, failedId: reactionFailedId } = useReactions();
    const rememberEmoji = useRecentEmojiStore(s => s.remember);

    // Derived from the UNFILTERED window: reaction events and replies are hidden feed
    // rows, so folding the visible `messages` would silently yield nothing (ADR-0093).
    const reactions = useMemo(() => foldReactions(rawChats, userId ?? null), [rawChats, userId]);
    const threadIndex = useMemo(() => buildThreadIndex(rawChats), [rawChats]);

    /**
     * My read cursor snapshotted at entry — the unseen-reply dot baseline. The LIVE
     * cursor is useless for this: useReadMarker advances it to the channel head within
     * a beat of entering (stage 1), which would clear every dot instantly. Leaving and
     * re-entering the room takes a fresh snapshot, so a thread visited in between
     * loses its dot — exactly the read semantics the cursor already has.
     */
    const [baselineReadNo, setBaselineReadNo] = useState<number | null>(null);
    useEffect(() => setBaselineReadNo(null), [stableChannelId]);
    const myReadNo = myJoin?.readNo;
    useEffect(() => {
        // First join-cache emission wins; later ones already carry the entry marker's echo.
        if (baselineReadNo === null && myReadNo !== undefined) setBaselineReadNo(myReadNo);
    }, [baselineReadNo, myReadNo]);

    /**
     * Leave for home when the channel is GONE — the row was there and disappeared (left the channel,
     * cache cleared). `useChannel` only reports an absence once it has actually resolved one, so this
     * no longer fires while a push-opened room is still being fetched; doing so used to unmount the
     * sync that was fetching it and made the room permanently unenterable.
     *
     * Also leave when the channel is somebody ELSE's self-chat (`isSomeoneElsesSelfChat`): only its
     * owner can ever read it, so the room would show nothing but refusals — and it used to poll the
     * owner's join on the way, raising a server alarm. This is how a stale push lands after switching
     * accounts on one device. Decided only once both ids are known; a legitimate room is never
     * bounced while the identity is still resolving.
     *
     * An unresolvable channel (`isChannelError`) is NOT redirected: the error screen below explains
     * itself and its "go back" action keeps the history entry the user came from. A REFUSED one is,
     * because there the cause is known — the server said I am not a member — and a load-failure
     * screen would blame the network for a membership fact.
     */
    const isForeignSelfChat = isSomeoneElsesSelfChat(channel, userId);
    // The row itself can say I am not in this room, and it has to — the server keeps serving the
    // room and its messages to somebody who left (measured 2026-09-21), so nothing else closes it.
    // Read off `memberIds`, which drops a departed member, with the cap and my own join row as the
    // two guards against closing a room on somebody who belongs in it. See `isNotMyChannel`.
    const isNotMine = isNotMyChannel(channel, myJoin, userId);
    // One notice per room, even if the effect re-runs before the redirect unmounts this screen.
    // Toasts stack, so a repeat would put the same sentence on screen two and three times.
    const noticedNotAMemberRef = useRef<string | null>(null);
    useEffect(() => {
        // A refusal is an answer, so it does not wait for the loading window to close — that window
        // exists for a fetch that might still arrive, and this one already came back.
        if (!isChannelForbidden && (isChannelLoading || isChannelError)) return;
        if (!channel || isForeignSelfChat || isNotMine || isChannelForbidden) {
            const alreadyNoticed = noticedNotAMemberRef.current === stableChannelId;
            noticedNotAMemberRef.current = stableChannelId;
            // Say something on the way out. A notification outlives the membership it was sent
            // for: leaving a room drops it from this device's list and cache, while the push that
            // announced it stays in the OS tray and in the in-app notification list — both of
            // which are deliberately NOT withdrawn on leave, because withdrawing them is
            // unreliable per platform and a tap can be answered safely instead. This is where it
            // is answered. A silent redirect looked identical to the app losing the tap.
            //
            // One line, not a dialog: nothing is being confirmed or prevented, and no way back in
            // is offered — returning to a 1:1 takes the other side's invite, so a button here
            // would be one that cannot work.
            if (!alreadyNoticed) toast({ title: t('chat.notAMember') });
            void navigate(ROUTES.root, { replace: true });
        }
    }, [
        channel,
        isForeignSelfChat,
        isNotMine,
        isChannelForbidden,
        isChannelLoading,
        isChannelError,
        navigate,
        t,
        stableChannelId,
    ]);

    // Read handling (stage 1: channel.chatNo right on entry, stage 2: correction after messages
    // load / on foreground return) is owned by useReadMarker. Marking read right after sending
    // is handled by markSent.
    const channelChatNo = channel?.chatNo;
    const lastMessage = useMemo(() => (messages.length > 0 ? messages[messages.length - 1] : null), [messages]);
    const lastChatNo = lastMessage?.isPending || lastMessage?.isFailed ? undefined : lastMessage?.chatNo;

    const { markSent } = useReadMarker({
        channelId: stableChannelId,
        channelChatNo,
        lastChatNo,
        isVerified,
        readMessage,
    });

    // Auto-scroll to bottom is paused while a jump to this channel is pending — if both are alive
    // at once, the bottom pin overwrites the jump (docs/specs/search/message-jump.md, "conflict with the bottom pin").
    const isJumpPending = useMessageJumpStore(s => s.target?.channelId === stableChannelId);

    // Scrolling (auto-scroll to bottom, position preservation for loadMore, resize/focus
    // correction, infinite loading) is owned by useChatScroll.
    const { containerRef: messagesEndRef, handleScroll: handleChatScroll } = useChatScroll({
        messages,
        hasMore,
        isLoadingMore,
        loadMore,
        inputRef,
        suppressAutoScroll: isJumpPending,
        // Restores the offset stashed by openThread when coming back from a thread.
        channelId: stableChannelId,
        // Growing composer = keyboard up (or a multi-line draft); the only such signal a native
        // WebView gives, since it injects `--keyboard-height` instead of firing `window.resize`.
        composerHeight,
    });

    // When entering via a message click from search results (?chatNo=), a request is registered
    // in the jump store and the query is removed (to prevent re-jumping on refresh). The actual
    // scroll/highlight/older-page loading is owned by useMessageJump (docs/specs/search/message-jump.md).
    useEffect(() => {
        const raw = searchParams.get('chatNo');
        if (!raw || !channelId) return;
        const chatNo = Number(raw);
        if (!Number.isInteger(chatNo) || chatNo <= 0) return;

        useMessageJumpStore.getState().request(channelId, chatNo);
        setSearchParams(
            params => {
                params.delete('chatNo');
                return params;
            },
            { replace: true }
        );
    }, [searchParams, channelId, setSearchParams]);

    useMessageJump({
        channelId: stableChannelId,
        containerRef: messagesEndRef,
        messages,
        hasMore,
        isLoadingMore,
        loadMore,
        loadUntil,
        // The same cursor the feed is windowed by, so a jump cannot aim at a row this screen is
        // never going to render.
        joinedNo: myJoin?.joinedNo,
    });

    // Floating date pill: while scrolling, finds and shows the label of the date group crossing
    // the container's top edge, then hides it a moment after scrolling stops. A lightweight
    // observation independent of useChatScroll's own scroll logic.
    const handleFloatingDateScroll = useCallback(() => {
        const container = messagesEndRef.current;
        if (!container) return;

        const containerTop = container.getBoundingClientRect().top;
        const groups = container.querySelectorAll<HTMLElement>('[data-date-label]');
        for (const group of Array.from(groups)) {
            const rect = group.getBoundingClientRect();
            // The group straddling the top edge owns the currently-visible date.
            if (rect.top <= containerTop + 1 && rect.bottom > containerTop) {
                const label = group.dataset.dateLabel;
                if (label) setFloatingDate(label);
                break;
            }
        }

        setShowFloatingDate(true);
        if (floatingHideTimerRef.current !== null) window.clearTimeout(floatingHideTimerRef.current);
        floatingHideTimerRef.current = window.setTimeout(() => setShowFloatingDate(false), 1200);
    }, [messagesEndRef]);

    const handleMessagesScroll = useCallback(() => {
        handleChatScroll();
        handleFloatingDateScroll();
    }, [handleChatScroll, handleFloatingDateScroll]);

    // Clear the pending hide timer on unmount.
    useEffect(() => {
        return () => {
            if (floatingHideTimerRef.current !== null) window.clearTimeout(floatingHideTimerRef.current);
        };
    }, []);

    const handleSend = (raw: string) => {
        const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);
        if (!trimmed || !stableChannelId) return;

        setContent('');

        sendMessage({ channelId: stableChannelId, content: trimmed })
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    markSent(newChat.chatNo);
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to send message', { error, data: { channelId: stableChannelId } });
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    const handleDeleteMessage = async (messageId?: string) => {
        if (!stableChannelId || !messageId) return;
        await deleteMessage(messageId, stableChannelId);
    };

    const handleRetryMessage = async (message: ClientChatView) => {
        if (!stableChannelId || !message.id) return;
        handleDeleteMessage(message.id)
            .then(() => sendMessage({ channelId: stableChannelId, content: message.content ?? '' }))
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    markSent(newChat.chatNo);
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to retry message', {
                    error,
                    data: { channelId: stableChannelId, messageId: message.id },
                });
            });
    };

    const handleOpenMessageActions = (message: ClientChatView) => {
        if (!message.content) return;
        setActionMessage(message);
    };

    /** Copies what the message SAYS, not what it is made of: a Block Kit body is flattened
     *  here rather than at the call site, so its payload cannot reach the clipboard. */
    const handleCopyMessage = async (rawContent?: string) => {
        const text = messagePlainText(rawContent);
        if (!text || isCopyingMessage) return;

        setIsCopyingMessage(true);
        try {
            await copyMessageToClipboard(text);
            toast({ title: t('chat.room.messageCopied') });
            setActionMessage(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopyingMessage(false);
        }
    };

    // The reader's place in the list is remembered by useChatScroll's unmount stash — every exit
    // from the room goes through it, so this hop does not have to save anything itself.
    const openThread = useCallback(
        (message: ClientChatView) => {
            if (!message.chatNo) return;
            // Hand the root across with the navigation. The thread derives everything from the
            // chat cache, whose first emission is asynchronous even when it is warm, so without
            // this the thread opens on a bare spinner for a beat — long enough to see, and long
            // enough that the translucent header has nothing behind it to blur.
            void navigate(ROUTES.channels.thread(stableChannelId, message.chatNo), {
                state: { rootChat: message },
            });
        },
        [navigate, stableChannelId]
    );

    // One tap on the action sheet's quick row (or a pick from the full sheet): toggle
    // against the folded state — hasMyReaction matches on the normalised fold key, so
    // an emoji differing only by variation selector still turns mine off.
    const handlePickEmoji = (emoji: string) => {
        const target = actionMessage;
        setActionMessage(null);
        setEmojiPickerOpen(false);
        if (!target?.id) return;
        rememberEmoji(emoji);
        toggleReaction(target.id, emoji, hasMyReaction(reactions.get(target.id), emoji));
    };

    // The chip row's add button. Setting the target and opening the picker in one step is
    // what lets `handlePickEmoji` serve both entry points unchanged — the action sheet stays
    // suppressed while the picker is open, so it never flashes on the way through.
    const handleAddReaction = (message: ClientChatView) => {
        setActionMessage(message);
        setEmojiPickerOpen(true);
    };

    const handleShowReactors = (messageId: string, key: string) => setReactorTarget({ messageId, key });

    const handleReplyAction = () => {
        const target = actionMessage;
        setActionMessage(null);
        if (target?.chatNo) openThread(target);
    };

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

    // A one-line quote of the message being deleted, cut short so the dialog stays a dialog.
    const deleteConfirmPreview = (() => {
        const body = messagePlainText(editing.deleteTarget?.content ?? '').trim();
        if (!body) return '';
        const oneLine = body.replace(/\s+/g, ' ');
        return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
    })();

    // Only the textarea may take the caret away from the textarea. Shared by the bottom bar's
    // pointer and mouse handlers — see the wrapper below for why both are needed.
    const keepCaretOnInput = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== inputRef.current) e.preventDefault();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (isMobile && e.key === 'Enter') return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(content);
        }
    };

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? t('chat.room.am') : t('chat.room.pm');
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const isSameGroup = useCallback(
        (msg1: ClientChatView, msg2: ClientChatView) => {
            if (!msg1 || !msg2 || msg1.isSystem || msg2.isSystem) return false;

            const sameOwner = msg1.ownerId === msg2.ownerId;
            const d1 = msg1.timestamp;
            const d2 = msg2.timestamp;
            const sameTime =
                d1.getFullYear() === d2.getFullYear() &&
                d1.getMonth() === d2.getMonth() &&
                d1.getDate() === d2.getDate() &&
                d1.getHours() === d2.getHours() &&
                d1.getMinutes() === d2.getMinutes();

            const rc1 = msg1.chatNo !== undefined ? getReadCount(msg1.chatNo).readCount : -1;
            const rc2 = msg2.chatNo !== undefined ? getReadCount(msg2.chatNo).readCount : -1;
            const sameReadCount = rc1 === rc2;

            const sameStatus = msg1.isFailed === msg2.isFailed && msg1.isPending === msg2.isPending;

            return sameOwner && sameTime && sameReadCount && sameStatus;
        },
        [getReadCount]
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const formatDateSeparator = (date: Date) => {
        const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const diffDays = Math.floor((todayStart - targetStart) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return t('chat.room.today');
        if (diffDays === 1) return t('chat.room.yesterday');

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
        const weekday = t(`chat.room.weekdays.${weekdayKeys[date.getDay()]}`);
        return t('chat.room.dateFormat', { year, month, day, weekday });
    };

    // Compact label for the scroll-time floating pill, e.g. "7. 01 월".
    // The weekday is the first character of the localized weekday name (a single Korean character).
    const formatFloatingDate = (date: Date) => {
        const month = date.getMonth() + 1;
        const day = String(date.getDate()).padStart(2, '0');
        const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
        const weekday = t(`chat.room.weekdays.${weekdayKeys[date.getDay()]}`).charAt(0);
        return `${month}. ${day} ${weekday}`;
    };

    const getDateKey = (date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const groupedMessages = useMemo(() => {
        return messages.reduce(
            (groups, message) => {
                const dateKey = getDateKey(message.timestamp);
                if (!groups[dateKey]) {
                    groups[dateKey] = [];
                }
                groups[dateKey].push(message);
                return groups;
            },
            {} as Record<string, typeof messages>
        );
    }, [messages]);

    if (isChannelError || isChatError) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-sm text-destructive">{t('chat.room.error')}</div>
                    <button onClick={() => navigate(-1)} className="mt-2 text-sm text-primary underline">
                        {t('chat.room.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    // Header avatar — self shows MY place-profile photo, DM the peer's, otherwise the channel
    // thumbnail (one shared rule with the home list / settings, see resolveChannelAvatar). With none
    // set, the ChatRoomHeader fallback glyph (person for self/direct, group for the rest).
    // The self-chat photo comes from the same profileMap the DM peer does — a self chat's only
    // member is me, so my profile is already synced into it.
    // Only the photo is read here: the header's own `kind` already selects its fallback glyph.
    const headerAvatarSrc = channel
        ? resolveChannelAvatar({
              channel,
              myThumbnail: userId ? profileMap.get(userId)?.thumbnail : undefined,
              peerThumbnail: dmPeer?.thumbnail,
          }).src
        : undefined;
    const headerAvatar = headerAvatarSrc ? (
        <img
            src={headerAvatarSrc}
            alt=""
            className="size-[42px] shrink-0 rounded-full border border-border object-cover"
        />
    ) : undefined;

    // Group header meta — an owner-first participant stack (max 5, resolved via
    // the site profile then the member user cache) plus the total member count.
    // Self / 1:1 DM headers stay single-line (no meta), so this is group-only.
    // Built inline (plain code, not a hook) since it sits past the error return.
    const headerMeta = !isGroupChat
        ? undefined
        : (() => {
              const memberById = new Map<string, (typeof members)[number]>();
              for (const member of members) if (member.id) memberById.set(member.id, member);
              const ids = orderMemberIdsOwnerFirst(channel?.ownerId, activeMemberIds, 5);
              const avatars = ids.map(id => {
                  const profile = profileMap.get(id);
                  const member = memberById.get(id);
                  const thumbnail = profile?.thumbnail ?? member?.thumbnail;
                  const name = profile?.nick ?? member?.nick ?? member?.name ?? '';
                  return thumbnail ? (
                      <ImageAvatar key={id} src={thumbnail} alt={name} size={20} className="ring-2 ring-surface" />
                  ) : (
                      <DefaultAvatar key={id} size={20} className="ring-2 ring-surface" />
                  );
              });
              return <AvatarGroup avatars={avatars} count={channel?.memberCount ?? 1} max={5} />;
          })();

    // The thread's opening description block — one per stereo (see RoomIntro). It is not an empty
    // state: it renders in the empty branch AND at the top of a live thread, so it survives the
    // first message. A DM cannot be invited into, and a guest / inactive cloud cannot issue one.
    const roomIntro = (
        <RoomIntro
            variant={isSelfChat ? 'self' : isDmChat ? 'dm' : 'group'}
            peerNick={dmPeer?.profileNick}
            isGroupOwner={isGroupChat && channel?.ownerId === userId}
            onInvite={
                !isGuest && isCloudActive
                    ? // roomDistance carries how many hops the invite flow is from this room screen, so
                      // its final "done" step can pop straight back here instead of stacking on top of it.
                      () => navigate(ROUTES.channels.invite(stableChannelId), { state: { roomDistance: 1 } })
                    : undefined
            }
        />
    );

    // The header clearance, as the last DOM child of the reversed list — i.e. the topmost thing in
    // it. This is the scroll container's own `padding-top` moved into the content, because in a
    // `flex-col-reverse` scroller that padding is not dependable scrollable overflow (see the
    // container's style). `12` is the list's `gap-3`, which now sits between this spacer and the
    // first row and would otherwise add itself on top of the clearance.
    const headerSpacer = (
        <div aria-hidden className="shrink-0" style={{ height: Math.max(0, headerHeight + 8 - 12) }} />
    );

    // Everything the room says about a peer who left, plus the way back (ADR-0068). Renders nothing
    // while the peer is here, so it can sit in the stream unconditionally.
    //
    // The CTA is withheld from a guest for the same reason the group invite is: issuing takes a main
    // user and the server answers 403 (ADR-0034). Unlike the group invite it does NOT ask for an
    // active cloud — a 1:1 lives on relay, so requiring one would disable the normal case.
    const dmInviteFooter = (
        <DmInviteFooter
            state={dmInviteState}
            countdown={dmInviteCountdown}
            onReinvite={
                isGuest
                    ? undefined
                    : () => {
                          const prefill = resolveReinvitePrefill();
                          navigate(ROUTES.invite.contact, {
                              state: {
                                  reinvite: {
                                      channelId: stableChannelId,
                                      // The peer's own nick is the fallback when this device never
                                      // issued the invite (so the log has no name for them).
                                      name: prefill.name ?? dmPeer?.profileNick,
                                      phone: prefill.phone,
                                  },
                              },
                          });
                      }
            }
        />
    );

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                <ChatRoomHeader
                    kind={isSelfChat ? 'self' : isDmChat ? 'direct' : 'group'}
                    title={roomTitle}
                    avatar={headerAvatar}
                    meta={headerMeta}
                    // Placeholders until the channel resolves — `roomTitle` has to fall back to the
                    // "unnamed channel" label while there is no channel to read a name off, and
                    // showing that for a beat reads as having opened the wrong room.
                    loading={isChannelLoading}
                    onBack={() => navigate(-1)}
                    moreMenu={
                        <DropdownMenuItem
                            onClick={() =>
                                navigate(ROUTES.channels.settings(stableChannelId), { state: { roomDistance: 1 } })
                            }
                            className="cursor-pointer gap-2"
                        >
                            <Settings size={16} />
                            <span>{t('home.settings')}</span>
                        </DropdownMenuItem>
                    }
                    className="border-b border-border"
                />
            </div>

            <div className="relative min-h-0 flex-1">
                <div
                    ref={messagesEndRef}
                    onScroll={handleMessagesScroll}
                    className="absolute inset-0 flex flex-col-reverse overflow-y-auto overflow-x-hidden overscroll-none gap-3"
                    style={{
                        // NO padding-top here — the header clearance is a spacer ELEMENT at the end
                        // of the list (see `headerSpacer`). In a `flex-col-reverse` scroller the
                        // content overflows towards the top, and the padding on that side is not
                        // reliably part of the scrollable overflow: WebKit (the app's WebView)
                        // leaves it out, so a thread taller than the viewport by less than the
                        // header simply reports `scrollHeight === clientHeight` and does not scroll
                        // AT ALL, with its oldest message stuck behind the header. A child element
                        // is content, and content always scrolls.
                        //
                        // Border-box composer height, so it already carries the input field, its
                        // padding and — when the keyboard is up — `--keyboard-height`. The list
                        // therefore always clears the composer and gains extra room to scroll the
                        // last message above a raised keyboard. This side is the scroller's start
                        // edge, where padding IS honoured, so it stays padding.
                        paddingBottom: composerHeight + 16,
                    }}
                >
                    {isRoomLoading ? (
                        <>
                            {/* Same spacer trick as the live list below, so the placeholder rows
                                start at the top and the real messages replace them in place. */}
                            <div aria-hidden className="flex-1" />
                            <RoomSkeleton />
                            {headerSpacer}
                        </>
                    ) : isChatEmpty ? (
                        <div
                            className="flex min-h-full flex-1 flex-col"
                            // The empty room carries the clearance as its own padding rather than
                            // the spacer: `min-h-full` is border-box, so it stays exactly one
                            // viewport tall instead of overflowing by a spacer with nothing to
                            // scroll to.
                            style={{ paddingTop: headerHeight + 8 }}
                        >
                            <DateDivider label={formatDateSeparator(new Date())} />
                            {roomIntro}
                            {/* A 1:1 whose peer left before anyone said anything is a real room, and
                                this branch is a separate tree from the live list below — mounting the
                                footer only there would leave it invisible here. */}
                            {dmInviteFooter}
                        </div>
                    ) : (
                        <>
                            {/* A thread that does not fill the screen reads from the top, like any
                                other list — only once it overflows does the newest message belong at
                                the bottom. This flex-grow spacer is the first DOM child, so in the
                                flex-col-reverse container it sits at the visual bottom and absorbs the
                                free space that would otherwise push short threads down. It collapses
                                to 0 as soon as the messages overflow, so tall threads scroll normally
                                — unlike `justify-end`, which clips overflowing content. */}
                            <div aria-hidden className="flex-1" />
                            {/* Second DOM child, so it lands directly above the spacer — i.e. below
                                the newest message, which is what "pinned to the bottom of the stream"
                                means in a `flex-col-reverse` container. */}
                            {dmInviteFooter}
                            {Object.entries(groupedMessages)
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([dateKey, dateMessages]) => {
                                    const reversedMessages = [...dateMessages].reverse();

                                    return (
                                        <div
                                            key={dateKey}
                                            data-date-label={formatFloatingDate(dateMessages[0].timestamp)}
                                            className="flex flex-col-reverse gap-3"
                                        >
                                            {reversedMessages.map((message, index) => {
                                                if (message.isSystem) {
                                                    // New model: system messages carry no text — render the
                                                    // localized clause from `subType` with the subject's name
                                                    // (profile nick preferred) as a bold prefix.
                                                    const suffixKey = systemMessageSuffixKey(message.subType);
                                                    if (suffixKey) {
                                                        const systemProfile = message.ownerId
                                                            ? profileMap.get(message.ownerId)
                                                            : undefined;
                                                        const systemName = systemProfile?.nick ?? message.ownerName;
                                                        return (
                                                            // A 1:1 losing its only other participant
                                                            // is the one notice this room is not
                                                            // neutral about, so Figma reddens it and
                                                            // drops the pill. A group leave stays a
                                                            // plain chip.
                                                            <SystemNotice
                                                                key={message.id}
                                                                tone={
                                                                    isDmChat && message.subType === 'leave'
                                                                        ? 'alert'
                                                                        : 'default'
                                                                }
                                                            >
                                                                <span className="font-semibold">{systemName}</span>
                                                                {t(suffixKey)}
                                                            </SystemNotice>
                                                        );
                                                    }
                                                    // Legacy fallback: older rows stored the full sentence in content.
                                                    const systemMatch = (message.content ?? '').match(
                                                        /^(.+?)(님이.+)$/
                                                    );
                                                    return (
                                                        <SystemNotice key={message.id}>
                                                            {systemMatch ? (
                                                                <>
                                                                    <span className="font-semibold">
                                                                        {systemMatch[1]}
                                                                    </span>
                                                                    {systemMatch[2]}
                                                                </>
                                                            ) : (
                                                                message.content
                                                            )}
                                                        </SystemNotice>
                                                    );
                                                }

                                                const chronPrevMessage = reversedMessages[index + 1];
                                                const chronNextMessage = reversedMessages[index - 1];

                                                const isSameAsPrev =
                                                    chronPrevMessage && isSameGroup(message, chronPrevMessage);
                                                const isSameAsNext =
                                                    chronNextMessage && isSameGroup(message, chronNextMessage);

                                                const showProfileAndName = !isSameAsPrev;
                                                const showTimeAndStatus =
                                                    !isSameAsNext || message.isPending || message.isFailed;

                                                // Site profile (nick/avatar) takes precedence over the
                                                // user-cache name fallback computed in useChats.
                                                const ownerProfile = message.ownerId
                                                    ? profileMap.get(message.ownerId)
                                                    : undefined;
                                                const ownerDisplayName = ownerProfile?.nick ?? message.ownerName;
                                                const ownerAvatar = ownerProfile?.thumbnail;

                                                const { readCount, unreadCount } =
                                                    message.chatNo !== undefined
                                                        ? getReadCount(message.chatNo)
                                                        : { readCount: 0, unreadCount: 0 };

                                                // Thread footer: loaded-reply aggregate keyed by the
                                                // root's chatNo string (buildThreadIndex).
                                                const threadMeta = message.chatNo
                                                    ? threadIndex.get(String(message.chatNo))
                                                    : undefined;
                                                // How many replies are new, not merely whether
                                                // any are — the footer prints the number. Zero
                                                // until the baseline snapshot lands, so a thread
                                                // never flashes an unseen count it then retracts.
                                                const unseenReplyCount =
                                                    threadMeta && baselineReadNo !== null
                                                        ? countUnseenReplies(threadMeta, baselineReadNo, userId ?? null)
                                                        : 0;

                                                return (
                                                    // The wrapper carries `data-chat-no` for the
                                                    // search jump (useMessageJump scrolls to it).
                                                    <div key={message.id} data-chat-no={message.chatNo}>
                                                        <ChannelMessageRow
                                                            message={message}
                                                            showProfileAndName={showProfileAndName}
                                                            showTimeAndStatus={showTimeAndStatus}
                                                            ownerDisplayName={ownerDisplayName}
                                                            ownerAvatar={ownerAvatar}
                                                            time={formatTime(message.timestamp)}
                                                            read={{
                                                                show: showReadReceipt,
                                                                isReady: isJoinReady,
                                                                readCount,
                                                                unreadCount,
                                                                mode: isDmChat ? 'dm' : 'count',
                                                            }}
                                                            onLongPress={() => handleOpenMessageActions(message)}
                                                            onExpand={() =>
                                                                setExpandedMessage({
                                                                    content: messagePlainText(message.content),
                                                                    ownerName: message.ownerName,
                                                                })
                                                            }
                                                            onRetry={() => handleRetryMessage(message)}
                                                            onDelete={() => handleDeleteMessage(message.id)}
                                                            reactions={
                                                                message.id ? reactions.get(message.id) : undefined
                                                            }
                                                            onToggleReaction={(emoji, isMine) =>
                                                                message.id && toggleReaction(message.id, emoji, isMine)
                                                            }
                                                            reactionFailed={
                                                                !!message.id && reactionFailedId === message.id
                                                            }
                                                            nameOf={nameOfUser}
                                                            onAddReaction={
                                                                message.chatNo
                                                                    ? () => handleAddReaction(message)
                                                                    : undefined
                                                            }
                                                            onShowReactors={key =>
                                                                message.id && handleShowReactors(message.id, key)
                                                            }
                                                            avatarOf={avatarOfUser}
                                                            edit={editing.editStateFor(message)}
                                                            threadMeta={threadMeta}
                                                            unseenReplyCount={unseenReplyCount}
                                                            formatThreadTime={formatTime}
                                                            onOpenThread={
                                                                message.chatNo ? () => openThread(message) : undefined
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                            <DateDivider label={formatDateSeparator(dateMessages[0].timestamp)} />
                                        </div>
                                    );
                                })}
                            {/* Last DOM child before the loader, so the reversed container puts it
                                above every date group — the room's own opening entry, at the top of
                                the thread rather than tucked inside the oldest day. */}
                            {hasThreadStart && roomIntro}
                            {isLoadingMore && (
                                <div className="flex justify-center py-3">
                                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {headerSpacer}
                        </>
                    )}
                </div>

                <div
                    className="pointer-events-none absolute inset-x-0 flex justify-center"
                    style={{ top: headerHeight + 8 }}
                >
                    <FloatingDateChip label={floatingDate} visible={showFloatingDate && !!floatingDate} />
                </div>
            </div>

            <div
                ref={composerRef}
                // Extend the keep-keyboard-open tolerance to the whole bottom bar — a finger
                // slipping off the input onto the surrounding padding shouldn't blur the
                // textarea. Only the textarea itself keeps the caret. `mousedown` as well as
                // `pointerdown`: on iOS WKWebView the focus move is the `mousedown` default
                // action, so cancelling `pointerdown` alone does not hold the caret (the same
                // reason MessageInput cancels both).
                onPointerDown={keepCaretOnInput}
                onMouseDown={keepCaretOnInput}
                // Floating composer (Figma 2948-28188 / 2948-29566): the bar itself has NO surface —
                // the translucent pill is the only chrome, so the message list stays visible right up
                // to the screen edge and scrolls behind it.
                className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2"
                style={{
                    // 8px above the keyboard when it is up, otherwise clear the home indicator.
                    // max(), never a sum — the keyboard already reaches the screen edge, so adding
                    // the safe-bottom inset on top of it is what made the bottom gap look oversized.
                    paddingBottom: `max(8px, var(--safe-bottom, 0px), calc(var(--keyboard-height, 0px) + 8px))`,
                }}
            >
                <MessageInput
                    value={content}
                    onChange={setContent}
                    onSend={handleSend}
                    onKeyDown={handleKeyDown}
                    inputRef={inputRef}
                    placeholder={t('chat.room.inputPlaceholder')}
                    // Nobody left to receive it: a message sent into an empty 1:1 would carry an
                    // unread badge of `1` forever. Lifts the moment the peer is back (ADR-0068 decision 5).
                    //
                    // Also locked while a message is being edited: two live fields on one screen
                    // and there is no telling which one you are typing into.
                    disabled={isPeerGone || editing.isEditing}
                />
            </div>

            <MessageDetailDialog message={expandedMessage} onClose={() => setExpandedMessage(null)} />

            <MessageActionSheet
                open={!!actionMessage && !emojiPickerOpen}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                // Persisted rows only (chatNo > 0): a reaction / reply targeting an
                // optimistic temp id would 404 and orphan once the persisted swap lands.
                canReact={!!actionMessage?.chatNo}
                canReply={!!actionMessage?.chatNo}
                // The shared verdict, so the room and the thread gate on exactly the same rule.
                // Authorship stays this app's own `isOwner` — the value already deciding which
                // side of the feed the bubble sits on.
                canModify={!!actionMessage && canModifyMessage(actionMessage, actionMessage.isOwner)}
                isCopying={isCopyingMessage}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setEmojiPickerOpen(true)}
                onCopy={() => void handleCopyMessage(actionMessage?.content)}
                onReply={handleReplyAction}
                onEdit={handleEditAction}
                onDelete={handleDeleteAction}
            />
            <ConfirmDialog
                open={!!editing.deleteTarget}
                onOpenChange={open => !open && editing.cancelDelete()}
                title={t('chat.room.deleteMessageTitle')}
                // Shows WHICH message is going: the sheet is long-pressed open from a wall of
                // bubbles, and delete sits next to edit.
                description={deleteConfirmPreview || t('chat.room.deleteMessageDescription')}
                confirmLabel={t('chat.room.deleteMessageConfirm')}
                onConfirm={() => void editing.confirmDelete()}
                isPending={editing.isDeleting}
                // Nothing is removed until the server answers, so the dialog IS the only feedback
                // there is. It stays up and spins; `confirmDelete` clears the target either way.
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
                // Read from the live fold, not snapshotted: a reaction toggled away while the
                // sheet is open should drop out of it too.
                open={!!reactorTarget}
                onOpenChange={open => !open && setReactorTarget(null)}
                tallies={(reactorTarget && reactions.get(reactorTarget.messageId)) || []}
                initialKey={reactorTarget?.key}
                nameOf={nameOfUser}
                avatarOf={avatarOfUser}
            />
            <EmojiPickerSheet
                open={emojiPickerOpen}
                onOpenChange={open => {
                    setEmojiPickerOpen(open);
                    if (!open) setActionMessage(null);
                }}
                onPick={handlePickEmoji}
            />
        </div>
    );
};
