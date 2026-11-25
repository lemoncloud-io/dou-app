import { Loader2 } from 'lucide-react';
import {
    useEffect,
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigationType, useParams, useSearchParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { useStackNavigate } from '../../../navigation';
import { pushEntryRegistry } from '../../../runtime/logging/pushEntryRegistry';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime, canModifyMessage, isMentioningViewer, type DomainChannel } from '@chatic/runtime-react';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    AvatarGroup,
    ChatRoomHeader,
    ComposerLockButton,
    DateDivider,
    DefaultAvatar,
    FloatingDateChip,
    ImageAvatar,
    JumpPill,
    MessageInput,
    type MessageInputProps,
    SystemNotice,
    UnreadDivider,
} from '@chatic/web-ui-kit';

import { ChannelMessageRow, type MessageReadInfo, type MessageSender } from '../components/ChannelMessageRow';
import { ComposerEditBar } from '../components/ComposerEditBar';
import { useChatImageAttach } from '../components/ChatImageAttach';
import { COMPOSER_PADDING_BOTTOM } from '../hooks/useAttachPanelSlot';
import { useVoiceMessage } from '../hooks/useVoiceMessage';
import { useComposerDraft } from '../hooks/useComposerDraft';
import { useMentionComposer } from '../hooks/useMentionComposer';
import { useSendImages } from '../hooks/useSendImages';
import { isPendingImageChat } from '../utils/imageTiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MentionSuggestions } from '../components/MentionSuggestions';
import { DmInviteFooter } from '../components/DmInviteFooter';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { MessageDetailDialog } from '../components/MessageDetailDialog';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { RoomIntro } from '../components/RoomIntro';
import { RoomSkeleton } from '../components/RoomSkeleton';
import { StackInRow } from '../components/StackInRow';
import {
    canStartDmFromProfile,
    channelKindOf,
    hasDmInviteFlow,
    isRoomOwner,
    profilePlaceOf,
    resolveChannelAvatar,
    resolveDmPeerName,
    roomOwnerIdOf,
} from '../lib';
import { orderMemberIdsOwnerFirst } from '../utils/orderMemberIds';
import { pickDmPeerId } from '../utils/dmPeer';
import { isChannelMember, isNotMyChannel, isSomeoneElsesSelfChat } from '../utils/membership';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelProfiles,
    useChannelTitle,
    useChatInputLock,
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
    useRoomJumpPills,
    useRoomOpenTrace,
    useRoomSyncTrace,
    useStartDm,
} from '../hooks';
import type { ClientChatView } from '../types';
import { GapDivider } from '../components/GapDivider';
import { chatGapKey, type ChatGap } from '../hooks/useChats';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { canOpenMessageActions, hasMessageText } from '../utils/messageActions';
import { resolveUserName, type DisplayNameSources } from '../utils/displayName';
import { chatPlainText, deleteConfirmQuote } from '../utils/messagePlainText';
import { isSendKey } from '../utils/composerEnter';
import { mentionViewerOf } from '../utils/mentionHighlight';
import { buildMentionCandidates } from '../utils/mentionInput';
import { isJumpTargetFor, useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { unreadEntryOf } from '../utils/unreadEntry';
import { buildThreadIndex, unseenReplies } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { systemMessageSuffixKey } from '../utils/systemMessage';
import { useDebugRoomMirror } from '../../debug';
import { toCloudId } from '../../../hooks/useCloudScope';
import { useBottomChromeToastLift } from '../../../ui/hooks/useBottomChromeToastLift';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { ROUTES } from '../../../routes/paths';
import { RoomMiniPlayer } from '../components/RoomMiniPlayer';
import { useRoomAudioSurface } from '../hooks/useRoomAudioSurface';
import { readCursorOf, readPositionOf, unreadOf } from '../../../utils/countUnread';

const MAX_INPUT_LENGTH = 5000;

const LIST_COMPOSER_GAP = 16;

const clearComposer = (list: HTMLElement | null, height: number) => {
    if (list) list.style.paddingBottom = `${height + LIST_COMPOSER_GAP}px`;
};

const readInRoomCloud = (cid: string, input: { channelId: string; chatNo: number }): Promise<void> =>
    runtime.data
        .getCloudRepositories(cid)
        .join.readChat(input)
        .then(receipt => receipt.delivered);

export const ChannelRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const enterStack = useStackNavigate();
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();

    const [content, setContent] = useComposerDraft(channelId || 'default');
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopyingMessage, setIsCopyingMessage] = useState(false);
    const [profileTarget, setProfileTarget] = useState<MessageSender | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);

    const [floatingDate, setFloatingDate] = useState('');
    const [showFloatingDate, setShowFloatingDate] = useState(false);
    const floatingHideTimerRef = useRef<number | null>(null);
    const restoreCaptionPicksRef = useRef<(() => void) | null>(null);

    const inputRef = useRef<HTMLTextAreaElement>(null);

    const {
        headerRef,
        footerRef: composerRef,
        headerHeight,
        footerHeight: composerHeight,
        followFooter: followComposer,
    } = useChromeInsets();
    useBottomChromeToastLift(composerHeight);

    const { isGuest, isCloudActive } = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();

    const stableChannelId = useMemo(() => channelId || 'default', [channelId]);
    const stableChannelIdForChannelHook = useMemo(() => channelId || null, [channelId]);

    const seedChannel = (location.state as { channel?: DomainChannel } | null)?.channel ?? null;

    const {
        channel,
        isLoading: isChannelLoading,
        isError: isChannelError,
        isForbidden: isChannelForbidden,
    } = useChannel(stableChannelIdForChannelHook, { seed: seedChannel });

    const roomCid = toCloudId(channel?.cid || selectedCloudId);
    const userId = runtime.session.useUidInCloud(roomCid);
    const { startDm, isAvailable: canStartDm } = useStartDm();

    const { joins, myJoin, activeMemberIds, cursorByUser } = useChannelJoins(stableChannelIdForChannelHook);

    const { members } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
        joins,
        keepLeftMembers: channel?.stereo === 'dm',
    });

    const profileTargetIds = useMemo(() => {
        if (channel?.stereo !== 'dm') return activeMemberIds;
        const peerId = pickDmPeerId(channel.memberIds ?? [], userId);
        return peerId && !activeMemberIds.includes(peerId) ? [...activeMemberIds, peerId] : activeMemberIds;
    }, [channel?.stereo, channel?.memberIds, activeMemberIds, userId]);

    const { profileMap } = useChannelProfiles(profilePlaceOf(channel, selectedSiteId), profileTargetIds);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

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

    const avatarOfUser = useCallback(
        (id: string) => profileMap.get(id)?.thumbnail ?? memberById.get(id)?.thumbnail,
        [profileMap, memberById]
    );

    const allMemberIds = useMemo(() => {
        const ids = new Set<string>(channel?.memberIds ?? []);
        if (userId) ids.add(userId);
        return [...ids];
    }, [channel?.memberIds, userId]);

    const isMember = isChannelMember(channel, myJoin, userId);

    const {
        getReadCount,
        getReaders,
        isReady: isJoinReady,
    } = useJoinPositions(roomCid, stableChannelIdForChannelHook, activeMemberIds, allMemberIds, cursorByUser, isMember);

    const channelKind = channel ? channelKindOf(channel.stereo) : undefined;
    const isSelfChat = channel?.isSelfChat ?? false;
    const isDmChat = channelKind === 'dm';
    const dmHasInviteFlow = hasDmInviteFlow(channel);
    const isGroupChat = channelKind === 'group';
    const dmPeer = useDmPeer(channel, members, profileMap, userId);

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
    const editing = useMessageEditing(stableChannelId);
    const mentionComposer = useMentionComposer({
        enabled: isGroupChat && !editing.isEditing,
        candidates: mentionCandidates,
        content,
        setContent,
        inputRef,
        scope: channelId || 'default',
    });
    useEffect(() => {
        restoreCaptionPicksRef.current = mentionComposer.restoreClearedPicks;
    }, [mentionComposer.restoreClearedPicks]);

    const { userId: sessionUid } = runtime.session.useSessionIdentity();
    const mentionViewer = useMemo(() => {
        const me = userId ? memberById.get(userId) : undefined;
        const names = [userId ? profileMap.get(userId)?.nick : undefined, me?.nick, me?.name];
        const memberNames = isGroupChat
            ? [
                  ...mentionCandidates.filter(row => !row.everyone).map(row => row.label),
                  userId ? nameOfUser(userId) : undefined,
              ]
            : undefined;
        const people = mentionCandidates
            .filter(row => !row.everyone)
            .map(row => ({ id: row.id, name: row.label, avatar: row.thumbnail }));
        return mentionViewerOf({ roomUid: userId, sessionUid, names, memberNames, people });
    }, [userId, sessionUid, memberById, profileMap, isGroupChat, mentionCandidates, nameOfUser]);
    const roomTitle = useChannelTitle(channel, {
        joinNick: myJoin?.nick,
        peerNick: dmPeer?.profileNick,
        peerCloudName: dmPeer?.cloudName,
    });
    const {
        state: dmInviteState,
        countdown: dmInviteCountdown,
        resolveReinvitePrefill,
    } = useDmInviteState({
        channelId: stableChannelId,
        hasInviteFlow: dmHasInviteFlow,
        peerId: dmPeer?.id,
        joins,
        channel,
        userId,
    });
    const isPeerGone = dmInviteState.kind !== 'present';
    const activeCount = activeMemberIds.length;
    const showReadReceipt = channelKind !== 'self' && !isPeerGone && activeCount >= 2;

    const readingHistoryRef = useRef(false);

    const memoizedChatParams = useMemo(
        () => ({
            channelId: stableChannelId,
            limit: 100,
            joinedNo: myJoin?.joinedNo,
            readingHistoryRef,
            channelChatNo: channel?.id === stableChannelId ? channel.chatNo : undefined,
        }),
        [stableChannelId, myJoin?.joinedNo, channel?.id, channel?.chatNo]
    );

    const {
        messages,
        rawChats,
        isLoading: isChatLoading,
        isEmpty: isChatEmpty,
        isLoadingMore,
        hasMore,
        canLoadMore,
        loadMore,
        loadUntil,
        gaps,
        gapStatus,
        fillGap,
        revalidateAround,
        fetchThrough,
        isFetched,
    } = useChats(memoizedChatParams);

    const { hiddenMedia } = useRoomAudioSurface({
        cid: roomCid,
        uid: userId ?? undefined,
        channelId: stableChannelId,
        messages,
    });

    useDebugRoomMirror('room', { channelId, channel, rendered: messages, rows: rawChats, focused: actionMessage });

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

    const hasThreadStart = useMemo(() => rawChats.some(chat => chat.chatNo === 1), [rawChats]);

    const isRoomLoading = isChannelLoading || isChatLoading;

    useRoomOpenTrace({
        channelId,
        isRoomLoading,
        isChatLoading,
        messageCount: messages.length,
        atThreadStart: hasThreadStart,
    });
    useRoomSyncTrace({ channelId, rawChats });

    const { sendMessage, retryMessage, deleteMessage } = useChatMutations();
    const inputLock = useChatInputLock(channelId);
    const composerLocked = isPeerGone || editing.isEditing || inputLock.isLocked;
    const unlockInput = useCallback(() => {
        inputLock.setLocked(false);
        toast({ title: t('chat.inputLock.unlocked') });
    }, [inputLock.setLocked, t]);
    const imageSend = useSendImages({ cid: roomCid, channelId: stableChannelId });
    const voice = useVoiceMessage({
        sendImages: imageSend.sendImages,
        disabled: composerLocked,
        scope: stableChannelId,
    });
    const attach = useChatImageAttach({
        sendImages: imageSend.sendImages,
        disabled: composerLocked,
        scope: stableChannelId,
        onVoice: voice.canRecord ? voice.open : undefined,
        inputRef,
        composerRef,
        onComposerSlide: sliding =>
            followComposer(sliding ? height => clearComposer(messagesEndRef.current, height) : null),
        onUnsentText: text => {
            setContent(current => (current.trim() ? current : text));
            restoreCaptionPicksRef.current?.();
        },
    });
    const { toggleReaction, failedId: reactionFailedId } = useReactions();
    const rememberEmoji = useRecentEmojiStore(s => s.remember);

    const reactions = useMemo(() => foldReactions(rawChats, userId ?? null), [rawChats, userId]);
    const threadIndex = useMemo(() => buildThreadIndex(rawChats), [rawChats]);

    const [baselineReadNo, setBaselineReadNo] = useState<number | null>(null);
    useEffect(() => setBaselineReadNo(null), [stableChannelId]);
    const myReadNo = myJoin?.readNo;
    useEffect(() => {
        if (baselineReadNo === null && myReadNo !== undefined) setBaselineReadNo(myReadNo);
    }, [baselineReadNo, myReadNo]);

    const isForeignSelfChat = isSomeoneElsesSelfChat(channel, userId);
    const isNotMine = isNotMyChannel(channel, myJoin, userId);
    const leftNotMyRoomRef = useRef<string | null>(null);
    useEffect(() => {
        if (!isChannelForbidden && (isChannelLoading || isChannelError)) return;
        if (!channel || isForeignSelfChat || isNotMine || isChannelForbidden) {
            if (leftNotMyRoomRef.current === stableChannelId) return;
            leftNotMyRoomRef.current = stableChannelId;
            toast({ title: t('chat.notAMember') });
            enterStack('eviction', ROUTES.root);
        }
    }, [
        channel,
        isForeignSelfChat,
        isNotMine,
        isChannelForbidden,
        isChannelLoading,
        isChannelError,
        enterStack,
        t,
        stableChannelId,
    ]);

    const channelChatNo = channel?.chatNo;
    const lastMessage = useMemo(() => (messages.length > 0 ? messages[messages.length - 1] : null), [messages]);
    const lastChatNo = lastMessage?.isPending || lastMessage?.isFailed ? undefined : lastMessage?.chatNo;

    const { markSent } = useReadMarker({
        cid: roomCid,
        channelId: stableChannelId,
        channelChatNo,
        lastChatNo,
        markRead: readInRoomCloud,
    });

    const isJumpPending = useMessageJumpStore(s => isJumpTargetFor(s.target, stableChannelId));
    const [isLandingPending, setLandingPending] = useState(true);

    const {
        containerRef: messagesEndRef,
        handleScroll: handleChatScroll,
        isAwayFromBottom,
        scrollToBottom: scrollChatToBottom,
        hasPendingRestore: hasPendingScrollRestore,
    } = useChatScroll({
        messages,
        hasMore,
        isLoadingMore,
        loadMore,
        inputRef,
        suppressAutoScroll: isJumpPending || (isLandingPending && isMember),
        holdBottomPin: editing.isEditing,
        channelId: stableChannelId,
        composerHeight,
        readingHistoryRef,
        onReadingRow: revalidateAround,
    });

    useEffect(() => {
        const raw = searchParams.get('chatNo');
        if (!raw || !channelId) return;
        const chatNo = Number(raw);
        if (!Number.isInteger(chatNo) || chatNo <= 0) return;

        useMessageJumpStore.getState().request(channelId, chatNo);
        setSearchParams(
            params => {
                const next = new URLSearchParams(params);
                next.delete('chatNo');
                return next;
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
        canLoadMore,
        loadUntil,
        joinedNo: myJoin?.joinedNo,
        isFetched,
        fetchThrough,
    });

    const handleFloatingDateScroll = useCallback(() => {
        const container = messagesEndRef.current;
        if (!container) return;

        const containerTop = container.getBoundingClientRect().top;
        const groups = container.querySelectorAll<HTMLElement>('[data-date-label]');
        for (const group of Array.from(groups)) {
            const rect = group.getBoundingClientRect();
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

    const [unreadDivider, setUnreadDivider] = useState<{ chatNo: number; count: number } | null>(null);
    const [awayFromCursor, setAwayFromCursor] = useState<number | undefined>(undefined);
    const entryRef = useRef({
        channelId: stableChannelId,
        skipLanding: false,
        decided: false,
        cursor: undefined as number | undefined,
        count: 0,
        widened: false,
    });
    if (entryRef.current.channelId !== stableChannelId) {
        entryRef.current = {
            channelId: stableChannelId,
            skipLanding: false,
            decided: false,
            cursor: undefined,
            count: 0,
            widened: false,
        };
    }
    useEffect(() => {
        setUnreadDivider(null);
        setAwayFromCursor(undefined);
        setLandingPending(true);
    }, [stableChannelId]);
    const navigationType = useNavigationType();
    useLayoutEffect(() => {
        entryRef.current.skipLanding =
            (navigationType === 'POP' && hasPendingScrollRestore()) ||
            isJumpTargetFor(useMessageJumpStore.getState().target, stableChannelId) ||
            searchParams.has('chatNo');
    }, [stableChannelId]);

    const {
        pill: jumpPill,
        checkInView: checkMentionsInView,
        firstMentionNo,
    } = useRoomJumpPills({
        channelId: stableChannelId,
        messages,
        containerRef: messagesEndRef,
        isAwayFromBottom,
        scrollToBottom: scrollChatToBottom,
        readCursor: myJoin ? (readCursorOf(readPositionOf(myJoin, channel?.$join)) ?? 0) : undefined,
        awayFromCursor,
    });

    useEffect(() => {
        const entry = entryRef.current;
        if (entry.decided || !myJoin || !channel || entry.channelId !== stableChannelId) return;
        if (entry.cursor === undefined) {
            entry.cursor = readCursorOf(readPositionOf(myJoin, channel.$join)) ?? 0;
            entry.count = unreadOf(channel, myJoin);
        }
        if (messages.length === 0) return;
        let at = unreadEntryOf(messages, entry.cursor, hasMore && !entry.widened);
        if (at.kind === 'unknown') {
            entry.widened = true;
            if (loadUntil(entry.cursor + 1)) return;
            at = unreadEntryOf(messages, entry.cursor, false);
        }
        entry.decided = true;
        setLandingPending(false);
        if (at.kind !== 'at') {
            if (!entry.skipLanding) scrollChatToBottom();
            return;
        }
        const cursor = entry.cursor;
        const drawn = messages.filter(
            message => !message.isOwner && !message.isSystem && (message.chatNo ?? 0) > cursor
        ).length;
        setUnreadDivider({ chatNo: at.chatNo, count: Math.max(entry.count, drawn) });
        if (entry.skipLanding) return;
        setAwayFromCursor(entry.cursor);
        if (firstMentionNo !== undefined && firstMentionNo >= at.chatNo) {
            useMessageJumpStore.getState().request(stableChannelId, firstMentionNo);
            return;
        }
        useMessageJumpStore
            .getState()
            .request(stableChannelId, at.chatNo, { highlight: false, block: 'start', quiet: true });
    }, [stableChannelId, myJoin, channel, messages, hasMore, loadUntil, firstMentionNo, scrollChatToBottom]);

    const handleMessagesScroll = useCallback(() => {
        handleChatScroll();
        handleFloatingDateScroll();
        checkMentionsInView();
    }, [handleChatScroll, handleFloatingDateScroll, checkMentionsInView]);

    useEffect(() => {
        return () => {
            if (floatingHideTimerRef.current !== null) window.clearTimeout(floatingHideTimerRef.current);
        };
    }, []);

    const handleSend = (raw: string) => {
        if (inputLock.isLocked) return;
        const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);
        const mention = mentionComposer.mentionFor(trimmed);
        if (attach.sendReady && attach.sendPicked(trimmed, mention)) {
            mentionComposer.clearPicks();
            setContent('');
            return;
        }
        if (!trimmed || !stableChannelId) return;

        mentionComposer.clearPicks();
        setContent('');

        const cid = roomCid;
        sendMessage(cid, { channelId: stableChannelId, content: trimmed, ...(mention ? { mention } : {}) })
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    markSent(newChat.chatNo);
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to send message', { error, data: { channelId: stableChannelId, cid } });
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    const handleDeleteMessage = async (message: ClientChatView) => {
        if (!message.id) return;
        imageSend.discard(message.id);
        await deleteMessage(message.cid, message.id);
    };

    const handleRetryMessage = async (message: ClientChatView) => {
        if (!message.id) return;
        if (isPendingImageChat(message)) {
            if (imageSend.canRetry(message.id)) void imageSend.retry(message.id);
            else toast({ title: t('chat.attach.cannotRetry') });
            return;
        }
        retryMessage(message)
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    markSent(newChat.chatNo);
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to retry message', {
                    error,
                    data: { channelId: message.channelId, cid: message.cid, messageId: message.id },
                });
            });
    };

    const handleOpenMessageActions = (message: ClientChatView) => {
        if (!canOpenMessageActions(message)) return;
        setActionMessage(message);
    };

    const handleCopyMessage = async (message?: ClientChatView | null) => {
        const text = message ? chatPlainText(message) : '';
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

    const openThread = useCallback(
        (message: ClientChatView) => {
            if (!message.chatNo) return;
            void navigate(ROUTES.channels.thread(stableChannelId, message.chatNo), {
                state: { rootChat: message },
            });
        },
        [navigate, stableChannelId]
    );

    const openMemberProfile = useCallback(
        (sender: MessageSender) => {
            if (!sender.id || sender.id === userId) return;
            setProfileTarget(sender);
            setProfileOpen(true);
        },
        [userId]
    );

    const handlePickEmoji = (emoji: string) => {
        const target = actionMessage;
        setActionMessage(null);
        setEmojiPickerOpen(false);
        if (!target?.id) return;
        rememberEmoji(emoji);
        toggleReaction(target.id, emoji, hasMyReaction(reactions.get(target.id), emoji));
    };

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

    const deleteConfirmPreview = deleteConfirmQuote(editing.deleteTarget?.content);

    const keepCaretOnInput = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== inputRef.current) e.preventDefault();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isSendKey(e.nativeEvent)) return;
        e.preventDefault();
        if (editing.composer) {
            editing.composer.onSave();
            return;
        }
        handleSend(content);
    };

    const composerFieldProps: Omit<MessageInputProps, 'inputRef' | 'onKeyDown'> = editing.composer
        ? {
              value: editing.composer.draft,
              onChange: editing.composer.onDraftChange,
              onSend: editing.composer.onSave,
              label: t('chat.room.editMessage'),
              placeholder: t('chat.room.editMessage'),
              sendLabel: t('chat.room.editSave'),
              disabled: editing.composer.isSaving,
          }
        : {
              value: content,
              onChange: mentionComposer.onChange,
              onSend: handleSend,
              sendReady: attach.sendReady,
              placeholder: inputLock.isLocked ? t('chat.inputLock.placeholder') : t('chat.room.inputPlaceholder'),
              sendLabel: t('common.send'),
              disabled: composerLocked,
              leadingSlot: inputLock.isLocked ? (
                  <ComposerLockButton onClick={unlockInput} label={t('chat.inputLock.unlock')} />
              ) : (
                  attach.button
              ),
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

    const lastMineChatNo = useMemo(() => {
        let last: number | undefined;
        for (const message of messages) {
            if (message.isOwner && message.chatNo !== undefined && (last === undefined || message.chatNo > last)) {
                last = message.chatNo;
            }
        }
        return last;
    }, [messages]);

    const groupReadOf = useCallback(
        (chatNo: number | undefined): MessageReadInfo => {
            if (!showReadReceipt || chatNo === undefined || chatNo !== lastMineChatNo) {
                return { show: false, isReady: isJoinReady, readCount: 0, unreadCount: 0, mode: 'readers' };
            }
            const readers = getReaders(chatNo).filter(id => id !== userId);
            const others = activeMemberIds.filter(id => id !== userId).length;
            return {
                show: true,
                isReady: isJoinReady,
                readCount: readers.length,
                unreadCount: Math.max(0, others - readers.length),
                mode: 'readers',
                readers,
            };
        },
        [showReadReceipt, lastMineChatNo, isJoinReady, getReaders, userId, activeMemberIds]
    );

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

    const gapsAboveMessageId = useMemo(() => {
        const byId = new Map<string, ChatGap[]>();
        let index = 0;
        for (const gap of gaps) {
            while (index < messages.length && !((messages[index].chatNo ?? 0) >= gap.newerNo)) index += 1;
            const message = messages[index];
            if (message?.id && message.chatNo) byId.set(message.id, [...(byId.get(message.id) ?? []), gap]);
        }
        return byId;
    }, [gaps, messages]);

    const withGapDividers = (rows: ClientChatView[], elements: ReactNode[]): ReactNode[] =>
        elements.flatMap((element, index) => {
            const above = rows[index]?.id ? gapsAboveMessageId.get(rows[index].id as string) : undefined;
            const unreadAbove =
                unreadDivider && rows[index]?.chatNo === unreadDivider.chatNo ? (
                    <div key="unread-divider" data-unread-divider>
                        <UnreadDivider label={t('chat.room.unreadDivider', { count: unreadDivider.count })} />
                    </div>
                ) : null;
            if (!above) return unreadAbove ? [element, unreadAbove] : [element];
            return [
                element,
                ...(unreadAbove ? [unreadAbove] : []),
                ...[...above].reverse().map(gap => {
                    const key = chatGapKey(gap);
                    return (
                        <GapDivider
                            key={`gap-${key}-${gap.missing}`}
                            status={gapStatus.get(key)}
                            canFill={canLoadMore}
                            onFill={side => void fillGap(gap, side)}
                        />
                    );
                }),
            ];
        });

    if (isChannelError) {
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

    const headerMeta = !isGroupChat
        ? undefined
        : (() => {
              const ids = orderMemberIdsOwnerFirst(roomOwnerIdOf(channel, joins), activeMemberIds, 5);
              const avatars = ids.map(id => {
                  const profile = profileMap.get(id);
                  const member = memberById.get(id);
                  const thumbnail = profile?.thumbnail;
                  const name = profile?.nick ?? member?.nick ?? member?.name ?? '';
                  return thumbnail ? (
                      <ImageAvatar key={id} src={thumbnail} alt={name} size={20} className="ring-2 ring-surface" />
                  ) : (
                      <DefaultAvatar key={id} size={20} className="ring-2 ring-surface" />
                  );
              });
              return <AvatarGroup avatars={avatars} count={channel?.memberCount ?? 1} max={5} />;
          })();

    const dmProfile: MessageSender | null =
        isDmChat && dmPeer?.id
            ? { id: dmPeer.id, name: resolveUserName(dmPeer.id, nameSources), avatar: dmPeer.thumbnail }
            : null;

    const roomIntro = (
        <RoomIntro
            variant={isSelfChat ? 'self' : isDmChat ? 'dm' : 'group'}
            peerNick={resolveDmPeerName(channel, dmPeer)}
            isGroupOwner={!!channel?.isOwner}
            onInvite={
                !isGuest && isCloudActive
                    ? () => navigate(ROUTES.channels.invite(stableChannelId), { state: { roomDistance: 1 } })
                    : undefined
            }
        />
    );

    const headerSpacer = (
        <div aria-hidden className="shrink-0" style={{ height: Math.max(0, headerHeight + 8 - 12) }} />
    );

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
                                      name: prefill.name ?? dmPeer?.profileNick,
                                      phone: prefill.phone,
                                  },
                              },
                          });
                      }
            }
        />
    );

    const openSettings = () => navigate(ROUTES.channels.settings(stableChannelId), { state: { roomDistance: 1 } });

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                <ChatRoomHeader
                    kind={isSelfChat ? 'self' : isDmChat ? 'direct' : 'group'}
                    title={roomTitle}
                    avatar={headerAvatar}
                    meta={headerMeta}
                    loading={isChannelLoading}
                    onBack={() => navigate(-1)}
                    onIdentityClick={dmProfile ? () => openMemberProfile(dmProfile) : undefined}
                    identityLabel={dmProfile ? t('chat.room.openProfile', { name: dmProfile.name }) : undefined}
                    onMetaClick={isGroupChat ? openSettings : undefined}
                    metaLabel={isGroupChat ? t('chat.room.openMembers') : undefined}
                    onMore={openSettings}
                    moreLabel={t('chat.room.openSettings')}
                    className="border-b border-border"
                />
            </div>

            <div className="relative min-h-0 flex-1">
                <div
                    ref={messagesEndRef}
                    onScroll={handleMessagesScroll}
                    className="absolute inset-0 flex flex-col-reverse overflow-y-auto overflow-x-hidden overscroll-none gap-3"
                    style={{
                        paddingBottom: composerHeight + LIST_COMPOSER_GAP,
                    }}
                >
                    {isRoomLoading ? (
                        <>
                            <div aria-hidden className="flex-1" />
                            <RoomSkeleton />
                            {headerSpacer}
                        </>
                    ) : isChatEmpty ? (
                        <div className="flex min-h-full flex-1 flex-col" style={{ paddingTop: headerHeight + 8 }}>
                            <DateDivider label={formatDateSeparator(new Date())} />
                            {roomIntro}
                            {dmInviteFooter}
                        </div>
                    ) : (
                        <>
                            <div aria-hidden className="flex-1" />
                            {dmInviteFooter}
                            {Object.entries(groupedMessages)
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([dateKey, dateMessages]) => {
                                    const reversedMessages = [...dateMessages].reverse();

                                    return (
                                        <div
                                            key={dateKey}
                                            data-date-label={formatFloatingDate(dateMessages[0].timestamp)}
                                            className="flex flex-col-reverse gap-3 [&_[data-chat-no]:has(+[data-unread-divider])]:scroll-mt-[var(--unread-divider-margin)]"
                                            style={
                                                {
                                                    '--unread-divider-margin': `${headerHeight + 56}px`,
                                                } as CSSProperties
                                            }
                                        >
                                            {withGapDividers(
                                                reversedMessages,
                                                reversedMessages.map((message, index) => {
                                                    if (message.isSystem) {
                                                        const suffixKey = systemMessageSuffixKey(message.subType);
                                                        if (suffixKey) {
                                                            const systemProfile = message.ownerId
                                                                ? profileMap.get(message.ownerId)
                                                                : undefined;
                                                            const systemName = systemProfile?.nick ?? message.ownerName;
                                                            return (
                                                                <div key={message.id} data-chat-no={message.chatNo}>
                                                                    <SystemNotice
                                                                        tone={
                                                                            isDmChat && message.subType === 'leave'
                                                                                ? 'alert'
                                                                                : 'default'
                                                                        }
                                                                    >
                                                                        <span className="font-semibold">
                                                                            {systemName}
                                                                        </span>
                                                                        {t(suffixKey)}
                                                                    </SystemNotice>
                                                                </div>
                                                            );
                                                        }
                                                        const systemMatch = (message.content ?? '').match(
                                                            /^(.+?)(님이.+)$/
                                                        );
                                                        return (
                                                            <div key={message.id} data-chat-no={message.chatNo}>
                                                                <SystemNotice>
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
                                                            </div>
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

                                                    const ownerProfile = message.ownerId
                                                        ? profileMap.get(message.ownerId)
                                                        : undefined;
                                                    const ownerDisplayName = ownerProfile?.nick ?? message.ownerName;
                                                    const ownerAvatar = ownerProfile?.thumbnail;

                                                    const { readCount, unreadCount } =
                                                        message.chatNo !== undefined
                                                            ? getReadCount(message.chatNo)
                                                            : { readCount: 0, unreadCount: 0 };

                                                    const threadMeta = message.chatNo
                                                        ? threadIndex.get(String(message.chatNo))
                                                        : undefined;
                                                    const unseen =
                                                        threadMeta && baselineReadNo !== null
                                                            ? unseenReplies(threadMeta, baselineReadNo, userId ?? null)
                                                            : [];
                                                    const unseenReplyCount = unseen.length;
                                                    const unseenRepliesMentionMe = unseen.some(entry =>
                                                        isMentioningViewer(entry, mentionViewer.ids)
                                                    );

                                                    return (
                                                        <StackInRow
                                                            key={message.tempId ?? message.id}
                                                            data-chat-no={message.chatNo}
                                                            enter={!!message.isPending && message.isOwner}
                                                        >
                                                            <ChannelMessageRow
                                                                message={message}
                                                                mentionViewer={mentionViewer}
                                                                hiddenMedia={hiddenMedia}
                                                                showProfileAndName={showProfileAndName}
                                                                showTimeAndStatus={showTimeAndStatus}
                                                                ownerDisplayName={ownerDisplayName}
                                                                ownerAvatar={ownerAvatar}
                                                                time={formatTime(message.timestamp)}
                                                                read={
                                                                    isDmChat
                                                                        ? {
                                                                              show: showReadReceipt,
                                                                              isReady: isJoinReady,
                                                                              readCount,
                                                                              unreadCount,
                                                                              mode: 'dm',
                                                                          }
                                                                        : groupReadOf(message.chatNo)
                                                                }
                                                                onLongPress={() => handleOpenMessageActions(message)}
                                                                onExpand={() =>
                                                                    setExpandedMessage({
                                                                        content: chatPlainText(message),
                                                                        ownerName: message.ownerName,
                                                                    })
                                                                }
                                                                onRetry={() => handleRetryMessage(message)}
                                                                onDelete={() => handleDeleteMessage(message)}
                                                                reactions={
                                                                    message.id ? reactions.get(message.id) : undefined
                                                                }
                                                                onToggleReaction={(emoji, isMine) =>
                                                                    message.id &&
                                                                    toggleReaction(message.id, emoji, isMine)
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
                                                                isEditTarget={editing.isEditTarget(message)}
                                                                threadMeta={threadMeta}
                                                                unseenReplyCount={unseenReplyCount}
                                                                unseenRepliesMentionMe={unseenRepliesMentionMe}
                                                                formatThreadTime={formatTime}
                                                                onOpenThread={
                                                                    message.chatNo
                                                                        ? () => openThread(message)
                                                                        : undefined
                                                                }
                                                                onOpenProfile={openMemberProfile}
                                                            />
                                                        </StackInRow>
                                                    );
                                                })
                                            )}
                                            <DateDivider label={formatDateSeparator(dateMessages[0].timestamp)} />
                                        </div>
                                    );
                                })}
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

                <RoomMiniPlayer
                    channelId={stableChannelId}
                    containerRef={messagesEndRef}
                    rowsVersion={messages}
                    top={headerHeight + 16}
                />

                <div
                    className="pointer-events-none absolute inset-x-0 flex justify-center"
                    style={{ top: headerHeight + 8 }}
                >
                    <FloatingDateChip label={floatingDate} visible={showFloatingDate && !!floatingDate} />
                </div>

                {jumpPill && (
                    <div
                        className="pointer-events-none absolute inset-x-0 flex justify-center"
                        style={{ bottom: composerHeight + 16 }}
                    >
                        <JumpPill
                            key={jumpPill.variant}
                            variant={jumpPill.variant}
                            label={t(jumpPill.variant === 'mention' ? 'chat.jump.mentions' : 'chat.jump.latest', {
                                count: jumpPill.count,
                            })}
                            onClick={jumpPill.onClick}
                            className="pointer-events-auto"
                        />
                    </div>
                )}
            </div>

            <div
                ref={composerRef}
                onPointerDown={keepCaretOnInput}
                onMouseDown={keepCaretOnInput}
                onFocus={event => {
                    if ((event.target as EventTarget) === inputRef.current) attach.closePanel();
                }}
                className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2"
                style={{
                    paddingBottom: COMPOSER_PADDING_BOTTOM,
                }}
            >
                {editing.composer ? (
                    <ComposerEditBar edit={editing.composer} inputRef={inputRef} />
                ) : (
                    <>
                        {attach.strip}
                        <MentionSuggestions candidates={mentionComposer.suggestions} onPick={mentionComposer.pick} />
                    </>
                )}
                <MessageInput inputRef={inputRef} onKeyDown={handleKeyDown} {...composerFieldProps} />
            </div>
            {attach.overlays}
            {voice.sheet}

            <MessageDetailDialog message={expandedMessage} onClose={() => setExpandedMessage(null)} />

            {profileTarget && (
                <MemberProfileDialog
                    open={profileOpen}
                    onOpenChange={setProfileOpen}
                    member={profileTarget}
                    memberIsOwner={isRoomOwner(
                        channel,
                        joins.find(join => join.userId === profileTarget.id),
                        profileTarget.id
                    )}
                    canKick={false}
                    onStartDm={
                        canStartDm &&
                        canStartDmFromProfile({
                            room: channel,
                            sessionCloudId: selectedCloudId,
                            sessionPlaceId: selectedSiteId,
                            memberId: profileTarget.id,
                            isMe: id => id === userId || id === sessionUid,
                        })
                            ? () => {
                                  setProfileOpen(false);
                                  void startDm(profileTarget.id);
                              }
                            : undefined
                    }
                />
            )}

            <MessageActionSheet
                open={!!actionMessage && !emojiPickerOpen}
                fileMessage={actionMessage}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                canReact={!!actionMessage?.chatNo}
                canReply={!!actionMessage?.chatNo}
                canModify={!!actionMessage && canModifyMessage(actionMessage, actionMessage.isOwner)}
                hasText={!!actionMessage && hasMessageText(actionMessage)}
                isCopying={isCopyingMessage}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setEmojiPickerOpen(true)}
                onCopy={() => void handleCopyMessage(actionMessage)}
                onReply={handleReplyAction}
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
