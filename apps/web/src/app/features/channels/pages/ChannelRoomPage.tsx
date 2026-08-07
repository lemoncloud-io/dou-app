import { Loader2, Settings, X } from 'lucide-react';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useSessionIdentity } from '@chatic/web-core';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { DropdownMenuItem } from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useRuntimeSocketState, useRuntimeProfile } from '@chatic/app-runtime';
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
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import { LinkedText } from '../components/LinkedText';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { RoomIntro } from '../components/RoomIntro';
import { resolveChannelAvatar } from '../lib';
import { orderMemberIdsOwnerFirst } from '../utils/orderMemberIds';
import {
    useChannel,
    useChannelMembers,
    useChannelProfiles,
    useChannelTitle,
    useChatMutations,
    useChats,
    useChatScroll,
    useDmPeer,
    useJoinPositions,
    useMessageJump,
    useMyJoin,
    useReactions,
    useReadMarker,
} from '../hooks';
import type { ClientChatView } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { buildThreadIndex } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { stashRoomScroll } from '../utils/roomScrollMemory';
import { systemMessageSuffixKey } from '../utils/systemMessage';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { ROUTES } from '../../../routes/paths';

// 입력 가능한 최대 글자 수
const MAX_INPUT_LENGTH = 5000;

export const ChannelRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const { channelId } = useParams<{ channelId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();

    // UI 상태 관리
    const [content, setContent] = useState('');
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    // The long-pressed message the action sheet targets (null = sheet closed).
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    // The chip whose reactors are being inspected: the message it belongs to plus the fold key
    // of the chip that was long-pressed (which tab the sheet opens on).
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopyingMessage, setIsCopyingMessage] = useState(false);

    // 스크롤 중 상단에 걸친 날짜 그룹을 표시하는 플로팅 pill 상태
    const [floatingDate, setFloatingDate] = useState('');
    const [showFloatingDate, setShowFloatingDate] = useState(false);
    const floatingHideTimerRef = useRef<number | null>(null);

    // DOM 접근을 위한 Ref (스크롤 컨테이너 ref는 useChatScroll이 소유)
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Header/composer float as z-index overlays above the full-bleed message list (the translucent
    // glass treatment) instead of being flex-col siblings that push it down — the rest is corrected
    // via padding measured off their actual rendered height.
    const { headerRef, footerRef: composerRef, headerHeight, footerHeight: composerHeight } = useChromeInsets();

    const { userId } = useSessionIdentity();
    const { isGuest, isCloudActive } = useRuntimeProfile();
    const { isVerified } = useRuntimeSocketState();

    // --- 데이터 패칭 Hooks ---
    const stableChannelId = useMemo(() => channelId || 'default', [channelId]);
    const stableChannelIdForChannelHook = useMemo(() => channelId || null, [channelId]);

    // Resolved before the member hook so its roster (`channel.memberIds`) can seed the member list —
    // the two have no dependency on each other beyond that.
    const { channel, isLoading: isChannelLoading, isError: isChannelError } = useChannel(stableChannelIdForChannelHook);

    // Loads member user identities (name/avatar fallback) + join read-state into the cache and
    // derives the active-membership set (join `joined !== 0`) that scopes the join/profile syncs.
    const { members, activeMemberIds } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
    });

    const { profileMap } = useChannelProfiles(channel?.sid ?? null, activeMemberIds);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    // Reactor display name for the chip a11y label — same precedence as message rows:
    // site-profile nick, then the member user cache.
    const nameOfUser = useCallback(
        (id: string) => profileMap.get(id)?.nick ?? memberById.get(id)?.nick ?? memberById.get(id)?.name ?? id,
        [profileMap, memberById]
    );

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

    const { getReadCount, isReady: isJoinReady } = useJoinPositions(
        stableChannelIdForChannelHook,
        activeMemberIds,
        allMemberIds
    );

    const isSelfChat = channel?.isSelfChat ?? false;
    // 1:1 DM (stereo). Header shows the peer's profile; no rename, no participant stack (ADR-0032).
    const isDmChat = channel?.stereo === 'dm';
    // Group = anything that is neither the self chat nor a 1:1 DM (stereo). The header
    // participant stack is group-only; self / 1:1 DM headers stay single-line.
    const isGroupChat = !!channel && !isSelfChat && !isDmChat;
    // DM peer (the other participant) for the header title/avatar — resolved from the roster, nick
    // from the site profile only. Null for non-DM channels.
    const dmPeer = useDmPeer(channel, members, profileMap, userId);
    // My join row from the join cache stream — NOT `channel.$join`, which is a projection that lags
    // the cache (see useMyJoin). The DM title reads the nick off it, so a rename in settings has to
    // land here immediately or the header disagrees with every other surface.
    const myJoin = useMyJoin(stableChannelIdForChannelHook);
    // One title chain for every surface (see useChannelTitle): the header must read exactly what
    // the home list row reads, so neither the branch nor the fallback label lives here.
    const roomTitle = useChannelTitle(channel, { joinNick: myJoin?.nick, peerNick: dmPeer?.profileNick });
    // Read receipts show for real groups only; the mode follows the active roster size
    // (the getReadCount denominator): 2 members read as a 1:1 (binary), 3+ as counts.
    const activeCount = activeMemberIds.length;
    const showReadReceipt = !isSelfChat && activeCount >= 2;

    const memoizedChatParams = useMemo(
        () => ({
            channelId: stableChannelId,
            limit: 100,
        }),
        [stableChannelId]
    );

    const {
        messages,
        rawChats,
        isLoading: isChatLoading,
        isEmpty: isChatEmpty,
        isLoadingMore,
        isError: isChatError,
        hasMore,
        isThreadStartLoaded,
        loadMore,
        loadUntil,
    } = useChats(memoizedChatParams);

    const { sendMessage, readMessage, deleteMessage } = useChatMutations();
    const { toggleReaction, failedId: reactionFailedId } = useReactions();
    const rememberEmoji = useRecentEmojiStore(s => s.remember);

    // Derived from the UNFILTERED window: reaction events and replies are hidden feed
    // rows, so folding the visible `messages` would silently yield nothing (ADR-0045).
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
     * An unresolvable channel (`isChannelError`) is NOT redirected: the error screen below explains
     * itself and its 돌아가기 keeps the history entry the user came from.
     */
    useEffect(() => {
        if (isChannelLoading || isChannelError) return;
        if (!channel) {
            void navigate(ROUTES.root, { replace: true });
        }
    }, [channel, isChannelLoading, isChannelError, navigate]);

    // 읽음 처리 (1단계: 진입 즉시 channel.chatNo, 2단계: 메시지 로딩 후 보정/포그라운드 복귀)는
    // useReadMarker가 소유한다. 전송 직후 읽음은 markSent로 처리한다.
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

    // 이 채널로의 점프가 대기 중인 동안에는 하단 자동 스크롤을 멈춘다 — 둘이 동시에 살아 있으면
    // 하단 고정이 점프를 덮어쓴다 (docs/specs/search/message-jump.md '하단 고정과의 충돌').
    const isJumpPending = useMessageJumpStore(s => s.target?.channelId === stableChannelId);

    // 스크롤(하단 자동 이동, loadMore 위치 보존, 리사이즈/포커스 보정, 무한 로딩)은 useChatScroll이 소유한다.
    const { containerRef: messagesEndRef, debouncedHandleScroll } = useChatScroll({
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

    // 검색 결과의 메시지 클릭(?chatNo=)으로 진입한 경우, 점프 스토어에 요청을 등록하고 쿼리를
    // 제거한다(새로고침 시 재점프 방지). 실제 스크롤/하이라이트/과거 페이지 로드는 useMessageJump가
    // 소유한다 (docs/specs/search/message-jump.md).
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
    });

    // 플로팅 날짜 pill: 스크롤 중 컨테이너 상단 경계에 걸친 날짜 그룹의 라벨을 찾아 표시하고,
    // 스크롤이 멎으면 잠시 뒤 감춘다. useChatScroll의 스크롤 로직과는 독립적인 경량 관측이다.
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
        debouncedHandleScroll();
        handleFloatingDateScroll();
    }, [debouncedHandleScroll, handleFloatingDateScroll]);

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

    const handleCopyMessage = async (messageContent: string) => {
        if (!messageContent || isCopyingMessage) return;

        setIsCopyingMessage(true);
        try {
            await copyMessageToClipboard(messageContent);
            toast({ title: t('chat.room.messageCopied') });
            setActionMessage(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopyingMessage(false);
        }
    };

    // Remember where the reader was before leaving: this page unmounts on the way to the thread,
    // and the reversed list would otherwise re-mount at the bottom and drop anyone who was
    // reading history back at the newest message.
    const openThread = useCallback(
        (message: ClientChatView) => {
            if (!message.chatNo) return;
            stashRoomScroll(stableChannelId, messagesEndRef.current?.scrollTop ?? 0);
            // Hand the root across with the navigation. The thread derives everything from the
            // chat cache, whose first emission is asynchronous even when it is warm, so without
            // this the thread opens on a bare spinner for a beat — long enough to see, and long
            // enough that the translucent header has nothing behind it to blur.
            void navigate(ROUTES.channels.thread(stableChannelId, message.chatNo), {
                state: { rootChat: message },
            });
        },
        [navigate, stableChannelId, messagesEndRef]
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
    // The weekday is the first character of the localized weekday name (한글 단일자).
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
            onInvite={!isGuest && isCloudActive ? () => navigate(ROUTES.channels.invite(stableChannelId)) : undefined}
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
                    onBack={() => navigate(-1)}
                    moreMenu={
                        <DropdownMenuItem
                            onClick={() => navigate(ROUTES.channels.settings(stableChannelId))}
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
                        paddingTop: headerHeight + 8,
                        // Border-box composer height, so it already carries the input field, its
                        // padding and — when the keyboard is up — `--keyboard-height`. The list
                        // therefore always clears the composer and gains extra room to scroll the
                        // last message above a raised keyboard.
                        paddingBottom: composerHeight + 16,
                    }}
                >
                    {isChatLoading ? (
                        <div className="flex min-h-full items-center justify-center">
                            <Loader2 size={24} className="animate-spin text-muted-foreground" />
                        </div>
                    ) : isChatEmpty ? (
                        <div className="flex min-h-full flex-1 flex-col">
                            <DateDivider label={formatDateSeparator(new Date())} />
                            {roomIntro}
                        </div>
                    ) : (
                        <>
                            {/* Self-chat is top-aligned (Figma 3186-13530): this flex-grow spacer is the
                                first DOM child, so in the flex-col-reverse container it sits at the visual
                                bottom and absorbs free space to push short threads to the top. It collapses
                                to 0 once messages overflow, so tall threads scroll normally (newest at the
                                bottom) — unlike `justify-end`, which clips overflowing content. */}
                            {isSelfChat && <div aria-hidden className="flex-1" />}
                            {Object.entries(groupedMessages)
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([dateKey, dateMessages], groupIndex, groupArr) => {
                                    const reversedMessages = [...dateMessages].reverse();
                                    // Oldest LOADED day group (last after the descending sort). The intro
                                    // renders just below this group's date divider so it reads
                                    // [date][intro][messages] — matching the empty state and Figma.
                                    // `isThreadStartLoaded` keeps it off mid-history: "oldest loaded" is
                                    // only the real thread start once nothing older is left, otherwise the
                                    // block would re-parent on every loadMore.
                                    const isThreadStart = groupIndex === groupArr.length - 1 && isThreadStartLoaded;

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
                                                            <SystemNotice key={message.id}>
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
                                                const hasUnseenReplies =
                                                    !!threadMeta &&
                                                    baselineReadNo !== null &&
                                                    threadMeta.lastReplyNo > baselineReadNo &&
                                                    threadMeta.lastReplyOwnerId !== userId;

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
                                                                    content: message.content ?? '',
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
                                                            threadMeta={threadMeta}
                                                            hasUnseenReplies={hasUnseenReplies}
                                                            onOpenThread={
                                                                message.chatNo ? () => openThread(message) : undefined
                                                            }
                                                        />
                                                    </div>
                                                );
                                            })}
                                            {isThreadStart && roomIntro}
                                            <DateDivider label={formatDateSeparator(dateMessages[0].timestamp)} />
                                        </div>
                                    );
                                })}
                            {isLoadingMore && (
                                <div className="flex justify-center py-3">
                                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                                </div>
                            )}
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
                />
            </div>

            <Dialog open={!!expandedMessage} onOpenChange={open => !open && setExpandedMessage(null)}>
                <DialogContent variant="slide-up" hideClose className="flex flex-col gap-0 bg-background">
                    <DialogDescription className="sr-only">View full message content</DialogDescription>
                    <header className="relative flex min-h-[48px] items-center justify-center border-b border-border px-4 py-3">
                        <DialogTitle className="text-[15px] font-semibold text-foreground">
                            {t('chat.room.messageDetail')}
                        </DialogTitle>
                        <button
                            onClick={() => setExpandedMessage(null)}
                            className="absolute right-3 flex size-8 items-center justify-center rounded-full outline-none transition-colors active:bg-muted"
                        >
                            <X size={20} className="text-muted-foreground" />
                        </button>
                    </header>
                    <div className="flex-1 overflow-y-auto px-4 py-3">
                        <p className="whitespace-pre-wrap break-all text-[15px] leading-[1.55] text-foreground">
                            {/* Full content, so no `truncated` — a URL the bubble had to cut is a
                                complete, tappable link here. */}
                            {expandedMessage && <LinkedText text={expandedMessage.content} />}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>

            <MessageActionSheet
                open={!!actionMessage && !emojiPickerOpen}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                // Persisted rows only (chatNo > 0): a reaction / reply targeting an
                // optimistic temp id would 404 and orphan once the persisted swap lands.
                canReact={!!actionMessage?.chatNo}
                canReply={!!actionMessage?.chatNo}
                isCopying={isCopyingMessage}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setEmojiPickerOpen(true)}
                onCopy={() => void handleCopyMessage(actionMessage?.content ?? '')}
                onReply={handleReplyAction}
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
