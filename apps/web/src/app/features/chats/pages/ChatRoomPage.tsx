import {
    AlertCircle,
    ArrowUp,
    ChevronLeft,
    Clock,
    Copy,
    Loader2,
    MoreHorizontal,
    PenLine,
    Plus,
    RotateCcw,
    Settings,
    User,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useDynamicProfile, UserType, useUserContext } from '@chatic/web-core';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useAppChecker } from '@chatic/device-utils';
import { useWebSocketV2Store } from '@chatic/socket';

import { InviteFriendsDialog } from '../components';
import { MessageBubble } from '../components/MessageBubble';
import { ReadStatus } from '../components/ReadStatus';
import { useChannel, useChannelMembers, useChatMutations, useChats, useJoinPositions } from '../../../shared/hooks';
import type { ClientChatView } from '../../../shared/types';
import { FOREGROUND_RESYNC_EVENT_NAME } from '../../../shared/types';
import { debounce } from '../../../shared/utils/debounce';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

// 입력 가능한 최대 글자 수
const MAX_INPUT_LENGTH = 5000;

export const ChatRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const { channelId } = useParams<{ channelId: string }>();

    // UI 상태 관리
    const [content, setContent] = useState('');
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    const [openActionMessageKey, setOpenActionMessageKey] = useState<string | null>(null);
    const [isCopyingMessage, setIsCopyingMessage] = useState(false);

    // DOM 접근을 위한 Ref
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 중복 읽음 처리 방지
    const lastReadChatNoRef = useRef<number | null>(null);

    const dynamicProfile = useDynamicProfile();
    const { userType, currentWSS } = useUserContext();
    const isDefaultCloud = currentWSS === 'relay';
    const { isIOS } = useAppChecker();
    const isVerified = useWebSocketV2Store(s => s.isVerified);

    // --- 데이터 패칭 Hooks ---
    const stableChannelId = useMemo(() => channelId || 'default', [channelId]);
    const stableChannelIdForChannelHook = useMemo(() => channelId || null, [channelId]);

    const { members, total: membersTotal } = useChannelMembers({ channelId: stableChannelId, detail: true });
    const { channel, isLoading: isChannelLoading, isError: isChannelError } = useChannel(stableChannelIdForChannelHook);
    const memberCount = membersTotal || channel?.memberCount || 0;

    const initialJoins = useMemo(
        () => members.map(m => m.$join).filter((j): j is NonNullable<typeof j> => !!j),
        [members]
    );
    const { getReadCount, isReady: isJoinReady } = useJoinPositions(stableChannelIdForChannelHook, initialJoins);

    const memoizedChatParams = useMemo(
        () => ({
            channelId: stableChannelId,
            limit: 100,
        }),
        [stableChannelId]
    );

    const {
        messages,
        isLoading: isChatLoading,
        isEmpty: isChatEmpty,
        isLoadingMore,
        isError: isChatError,
        hasMore,
        loadMore,
    } = useChats(memoizedChatParams);

    const { isPending, sendMessage, readMessage, deleteMessage } = useChatMutations();
    const isSending = isPending.send;

    useEffect(() => {
        if (isChannelLoading) return;
        if (!channel || isChannelError) {
            void navigate('/', { replace: true });
        }
    }, [channel, isChannelLoading, isChannelError, navigate]);

    const scrollToBottom = (smooth = false) => {
        requestAnimationFrame(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollTo({
                    top: 0,
                    behavior: smooth ? 'smooth' : 'auto',
                });
            }
        });
    };

    // 1단계: 채널 진입 즉시 읽음 처리 — 메시지 로딩을 기다리지 않고 channel.chatNo로 바로 전송
    const channelChatNo = channel?.chatNo;
    useEffect(() => {
        if (!stableChannelId || !channelChatNo || !isVerified || document.visibilityState === 'hidden') return;
        if (lastReadChatNoRef.current !== null && channelChatNo <= lastReadChatNoRef.current) return;

        lastReadChatNoRef.current = channelChatNo;
        readMessage({ channelId: stableChannelId, chatNo: channelChatNo }).catch(error => {
            lastReadChatNoRef.current = null;
            logger.error('CHAT', 'Failed to read on channel entry', {
                error,
                data: { channelId: stableChannelId, chatNo: channelChatNo },
            });
        });
    }, [channelChatNo, stableChannelId, readMessage, isVerified]);

    // 2단계: 메시지 로딩 후 더 높은 chatNo가 있으면 보정 + 포그라운드 복귀 대응
    const lastMessage = useMemo(() => (messages.length > 0 ? messages[messages.length - 1] : null), [messages]);
    const lastChatNo = lastMessage?.isPending || lastMessage?.isFailed ? undefined : lastMessage?.chatNo;

    useEffect(() => {
        if (!stableChannelId || lastChatNo === undefined || !isVerified) return;

        const handleAutoRead = () => {
            if (document.visibilityState === 'hidden') return;
            if (lastReadChatNoRef.current !== null && lastChatNo <= lastReadChatNoRef.current) return;

            lastReadChatNoRef.current = lastChatNo;
            readMessage({ channelId: stableChannelId, chatNo: lastChatNo }).catch(error => {
                lastReadChatNoRef.current = null;
                logger.error('CHAT', 'Failed to read latest message', {
                    error,
                    data: { channelId: stableChannelId, chatNo: lastChatNo },
                });
            });
        };

        const handleForegroundResync = () => {
            handleAutoRead();
            // sync 완료 후 새 메시지가 반영될 수 있으므로 지연 재시도
            setTimeout(handleAutoRead, 1500);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // 포그라운드 복귀 시 ref 리셋 → 이전 요청이 유실됐을 경우 재전송 허용
                lastReadChatNoRef.current = null;
                handleAutoRead();
            }
        };

        handleAutoRead();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleForegroundResync);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleForegroundResync);
        };
    }, [lastChatNo, stableChannelId, readMessage, isVerified]);

    const prevMessageCountRef = useRef(messages.length);
    const prevLastMessageIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (messages.length > prevMessageCountRef.current && lastMessage?.id !== prevLastMessageIdRef.current) {
            scrollToBottom(false);
        }
        prevLastMessageIdRef.current = lastMessage?.id;
        prevMessageCountRef.current = messages.length;
    }, [messages.length]);

    useEffect(() => {
        const handleScrollAdjust = () => setTimeout(() => scrollToBottom(), 150);
        const input = inputRef.current;

        window.addEventListener('resize', handleScrollAdjust);
        input?.addEventListener('focus', handleScrollAdjust);

        return () => {
            window.removeEventListener('resize', handleScrollAdjust);
            input?.removeEventListener('focus', handleScrollAdjust);
        };
    }, []);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
            inputRef.current.style.overflowY = inputRef.current.scrollHeight > 120 ? 'auto' : 'hidden';
        }
    }, [content]);

    const handleSend = () => {
        const trimmed = content.trim().slice(0, MAX_INPUT_LENGTH);
        if (!trimmed || !stableChannelId) return;

        setContent('');

        sendMessage({ channelId: stableChannelId, content: trimmed })
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    lastReadChatNoRef.current = newChat.chatNo;
                    readMessage({ channelId: stableChannelId, chatNo: newChat.chatNo }).catch(error => {
                        logger.error('CHAT', 'Failed to read sent message', {
                            error,
                            data: { channelId: stableChannelId, chatNo: newChat.chatNo },
                        });
                    });
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
                    lastReadChatNoRef.current = newChat.chatNo;
                    readMessage({ channelId: stableChannelId, chatNo: newChat.chatNo }).catch(error => {
                        logger.error('CHAT', 'Failed to read retried message', {
                            error,
                            data: { channelId: stableChannelId, chatNo: newChat.chatNo },
                        });
                    });
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to retry message', {
                    error,
                    data: { channelId: stableChannelId, messageId: message.id },
                });
            });
    };

    const handleOpenMessageActions = (message: ClientChatView, messageKey: string) => {
        if (!message.content) return;
        setOpenActionMessageKey(messageKey);
    };

    const handleCopyMessage = async (messageContent: string) => {
        if (!messageContent || isCopyingMessage) return;

        setIsCopyingMessage(true);
        try {
            await copyMessageToClipboard(messageContent);
            toast({ title: t('chat.room.messageCopied') });
            setOpenActionMessageKey(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopyingMessage(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (isMobile && e.key === 'Enter') return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleScroll = useCallback(() => {
        const el = messagesEndRef.current;
        if (!el || !hasMore || isLoadingMore) return;

        //스크롤 컨텐츠가 화면을 다 채우지 않은 경우 무한 로딩 방지
        if (el.scrollHeight <= el.clientHeight) return;

        const distanceFromTop = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
        if (distanceFromTop < 200) {
            loadMore();
        }
    }, [hasMore, isLoadingMore, loadMore]);

    const debouncedHandleScroll = useMemo(() => debounce(handleScroll, 100), [handleScroll]);

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

    return (
        <div className="flex h-full flex-col pt-safe-top bg-background">
            <header className="relative z-10 flex min-h-[48px] items-center justify-center border-b border-border px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">
                    {channel?.isSelfChat ? t('channelList.selfChannel') : channel?.name || t('chat.room.title')}
                    {!channel?.isSelfChat && memberCount > 0 && (
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{memberCount}</span>
                    )}
                </h1>
                {!channel?.isSelfChat && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="absolute right-4 p-1">
                                <MoreHorizontal size={22} className="text-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => navigate(`/chats/${stableChannelId}/settings`)}
                                className="cursor-pointer gap-2"
                            >
                                <Settings size={16} />
                                <span>{t('home.settings')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </header>

            <div
                ref={messagesEndRef}
                onScroll={debouncedHandleScroll}
                className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-none px-4 pb-4 pt-2 gap-3"
            >
                {isChatLoading ? (
                    <div className="flex min-h-full items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                ) : isChatEmpty ? (
                    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center">
                        <div className="absolute left-0 right-0 top-2 text-center">
                            <span className="text-[13px] tracking-[-0.195px] text-muted-foreground">
                                {formatDateSeparator(new Date())}
                            </span>
                        </div>
                        <div className="flex flex-col items-center gap-4">
                            {channel?.isSelfChat ? (
                                <>
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                        <PenLine size={24} className="text-muted-foreground" />
                                    </div>
                                    <div className="text-center text-[16px] leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                        <p>{t('chat.room.emptyState.selfLine1')}</p>
                                        <p>{t('chat.room.emptyState.selfLine2')}</p>
                                    </div>
                                </>
                            ) : (
                                channel?.ownerId === dynamicProfile?.uid &&
                                userType !== UserType.TEMP_ACCOUNT &&
                                userType !== UserType.SOCIAL_NO_CLOUD && (
                                    <>
                                        <div className="text-center text-[16px] leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                            <p>{t('chat.room.emptyState.line1')}</p>
                                            <p>{t('chat.room.emptyState.line2')}</p>
                                        </div>
                                        <button
                                            onClick={() => setInviteDialogOpen(true)}
                                            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-background"
                                        >
                                            <Plus size={20} />
                                            <span className="text-[16px] font-semibold">
                                                {t('chat.room.emptyState.inviteButton')}
                                            </span>
                                        </button>
                                    </>
                                )
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {Object.entries(groupedMessages)
                            .sort(([a], [b]) => b.localeCompare(a))
                            .map(([dateKey, dateMessages]) => {
                                const reversedMessages = [...dateMessages].reverse();

                                return (
                                    <div key={dateKey} className="flex flex-col-reverse gap-3">
                                        {reversedMessages.map((message, index) => {
                                            if (message.isSystem) {
                                                const systemMatch = (message.content ?? '').match(/^(.+?)(님이.+)$/);
                                                return (
                                                    <div key={message.id} className="flex justify-center py-1">
                                                        <span className="rounded-full bg-foreground/5 px-2.5 py-1.5 text-sm text-foreground">
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
                                                        </span>
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
                                            const messageActionKey =
                                                message.id ||
                                                `${message.chatNo ?? 'pending'}-${message.timestamp.getTime()}-${index}`;

                                            return (
                                                <div
                                                    key={message.id}
                                                    className={`flex gap-1.5 ${message.isOwner ? 'justify-end' : 'justify-start'} ${!showProfileAndName ? '-mt-1' : ''}`}
                                                >
                                                    {!message.isOwner &&
                                                        (showProfileAndName ? (
                                                            <div className="flex size-[39px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                                <User className="size-4 text-muted-foreground" />
                                                            </div>
                                                        ) : (
                                                            <div className="size-[39px] flex-shrink-0" />
                                                        ))}
                                                    <div
                                                        className={`flex max-w-[75%] flex-col ${message.isOwner ? 'items-end' : 'items-start'}`}
                                                    >
                                                        {!message.isOwner && showProfileAndName && (
                                                            <span className="mb-1 text-xs text-muted-foreground">
                                                                {message.ownerName}
                                                            </span>
                                                        )}
                                                        <div
                                                            className={`flex items-center gap-1.5 ${message.isOwner ? 'flex-row' : ''}`}
                                                        >
                                                            {message.isFailed && message.isOwner && (
                                                                <button
                                                                    onClick={() => handleRetryMessage(message)}
                                                                    className="flex flex-shrink-0 items-center"
                                                                >
                                                                    <AlertCircle
                                                                        size={20}
                                                                        className="text-destructive"
                                                                    />
                                                                </button>
                                                            )}
                                                            <DropdownMenu
                                                                open={openActionMessageKey === messageActionKey}
                                                                onOpenChange={open => {
                                                                    if (
                                                                        !open &&
                                                                        openActionMessageKey === messageActionKey
                                                                    ) {
                                                                        setOpenActionMessageKey(null);
                                                                    }
                                                                }}
                                                            >
                                                                <DropdownMenuTrigger asChild>
                                                                    <span
                                                                        className="inline-flex max-w-full"
                                                                        onPointerDown={event => event.preventDefault()}
                                                                    >
                                                                        <MessageBubble
                                                                            content={message.content ?? ''}
                                                                            isMine={message.isOwner}
                                                                            onLongPress={() =>
                                                                                handleOpenMessageActions(
                                                                                    message,
                                                                                    messageActionKey
                                                                                )
                                                                            }
                                                                            status={
                                                                                message.isFailed
                                                                                    ? 'failed'
                                                                                    : message.isPending
                                                                                      ? 'pending'
                                                                                      : undefined
                                                                            }
                                                                            onAction={
                                                                                message.isFailed
                                                                                    ? () => handleRetryMessage(message)
                                                                                    : () =>
                                                                                          setExpandedMessage({
                                                                                              content:
                                                                                                  message.content ?? '',
                                                                                              ownerName:
                                                                                                  message.ownerName,
                                                                                          })
                                                                            }
                                                                        />
                                                                    </span>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent
                                                                    align={message.isOwner ? 'end' : 'start'}
                                                                    side="top"
                                                                    sideOffset={6}
                                                                    className="min-w-[132px]"
                                                                >
                                                                    <DropdownMenuItem
                                                                        disabled={isCopyingMessage}
                                                                        onSelect={() =>
                                                                            void handleCopyMessage(
                                                                                message.content ?? ''
                                                                            )
                                                                        }
                                                                        className="cursor-pointer gap-2"
                                                                    >
                                                                        {isCopyingMessage &&
                                                                        openActionMessageKey === messageActionKey ? (
                                                                            <Loader2 className="size-4 animate-spin" />
                                                                        ) : (
                                                                            <Copy className="size-4" />
                                                                        )}
                                                                        <span>{t('chat.room.copyMessage')}</span>
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                        {showTimeAndStatus && (
                                                            <div
                                                                className={`mt-1 flex items-center gap-1.5 text-[11px] leading-4 ${message.isOwner ? 'flex-row-reverse' : ''}`}
                                                            >
                                                                {message.isPending ? (
                                                                    <span className="flex items-center gap-1 text-muted-foreground/70">
                                                                        <Clock size={11} />
                                                                        <span>{t('chat.room.sending')}</span>
                                                                    </span>
                                                                ) : message.isFailed ? (
                                                                    <div className="flex items-center gap-1 text-destructive">
                                                                        <AlertCircle size={11} />
                                                                        <span>{t('chat.room.failed')}</span>
                                                                        {message.isOwner && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        handleRetryMessage(message)
                                                                                    }
                                                                                    className="ml-2 flex items-center text-destructive"
                                                                                    title={t('chat.room.retry')}
                                                                                >
                                                                                    <RotateCcw size={11} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        handleDeleteMessage(message.id)
                                                                                    }
                                                                                    className="ml-1 flex items-center text-destructive"
                                                                                    title={t('chat.room.delete')}
                                                                                >
                                                                                    <X size={11} />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-muted-foreground">
                                                                            {formatTime(message.timestamp)}
                                                                        </span>
                                                                        {!isDefaultCloud &&
                                                                            message.chatNo !== undefined &&
                                                                            (!isJoinReady ? (
                                                                                <Loader2
                                                                                    size={11}
                                                                                    className="animate-spin text-muted-foreground"
                                                                                />
                                                                            ) : (
                                                                                (() => {
                                                                                    const { readCount, unreadCount } =
                                                                                        getReadCount(message.chatNo);
                                                                                    return (
                                                                                        <ReadStatus
                                                                                            readCount={readCount}
                                                                                            unreadCount={unreadCount}
                                                                                        />
                                                                                    );
                                                                                })()
                                                                            ))}
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="py-2 text-center pb-1">
                                            <span className="text-[13px] tracking-[-0.195px] text-muted-foreground">
                                                {formatDateSeparator(dateMessages[0].timestamp)}
                                            </span>
                                        </div>
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

            {userType !== UserType.TEMP_ACCOUNT && userType !== UserType.SOCIAL_NO_CLOUD && !channel?.isSelfChat && (
                <InviteFriendsDialog
                    open={inviteDialogOpen}
                    onOpenChange={setInviteDialogOpen}
                    channelId={stableChannelId}
                />
            )}

            <div
                onMouseDown={e => {
                    if (e.target === e.currentTarget) {
                        e.preventDefault();
                        inputRef.current?.focus();
                    }
                }}
                onTouchEnd={e => {
                    if (e.target === e.currentTarget) {
                        inputRef.current?.focus();
                    }
                }}
                className="border-t border-border bg-background px-4 py-3"
                style={{
                    paddingBottom: isIOS
                        ? `calc(12px + max(var(--safe-bottom, 0px), var(--keyboard-height, 0px)))`
                        : `calc(12px + var(--safe-bottom, 0px) + var(--keyboard-height, 0px))`,
                }}
            >
                <div
                    onMouseDown={e => {
                        if (e.target === e.currentTarget) {
                            e.preventDefault();
                            inputRef.current?.focus();
                        }
                    }}
                    onTouchEnd={e => {
                        if (e.target === e.currentTarget) {
                            inputRef.current?.focus();
                        }
                    }}
                    className="flex items-end gap-1.5 rounded-2xl bg-muted px-3 py-1.5"
                >
                    <textarea
                        ref={inputRef}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('chat.room.inputPlaceholder')}
                        rows={1}
                        enterKeyHint={isMobile ? 'enter' : 'send'}
                        className="max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                    />
                    <button
                        onMouseDown={e => e.preventDefault()}
                        onTouchStart={e => e.preventDefault()}
                        onClick={handleSend}
                        disabled={isSending || !content.trim()}
                        className="relative flex size-8 flex-shrink-0 items-center justify-center before:absolute before:inset-[-8px] before:content-['']"
                    >
                        <span
                            className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                                content.trim() && !isSending
                                    ? 'bg-foreground text-background'
                                    : 'bg-muted-foreground/20 text-muted-foreground'
                            }`}
                        >
                            {isSending ? (
                                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                            ) : (
                                <ArrowUp size={18} />
                            )}
                        </span>
                    </button>
                </div>
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
                            {expandedMessage?.content}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
