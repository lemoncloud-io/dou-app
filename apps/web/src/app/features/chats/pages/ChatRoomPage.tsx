import { ArrowUp, ChevronLeft, Loader2, MoreHorizontal, Plus, RotateCcw, Settings, User, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';

import { LoadingFallback } from '@chatic/shared';
import { useDynamicProfile, useUserContext, UserType } from '@chatic/web-core';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { toClientChatView } from '@chatic/chats';

import { useSendMessage } from '../hooks/useSendMessage';
import { useMyChannel } from '../hooks/useMyChannel';
import { useReadMessage } from '../hooks/useReadMessage';
import { useChatMessages } from '../hooks/useChatMessages';
import { useMyChannels } from '../../home/hooks/useMyChannels';
import { InviteFriendsDialog } from '../components/InviteFriendsDialog';
import { MessageBubble } from '../components/MessageBubble';
import { ReadStatus } from '../components/ReadStatus';
import { useAppChecker } from '@chatic/device-utils';

const MAX_INPUT_LENGTH = 5000;

export const ChatRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [content, setContent] = useState('');
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const tempIdCounter = useRef(0);
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { emit } = useWebSocketV2();
    const { toast } = useToast();
    const { sendMessage } = useSendMessage();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);

    const dynamicProfile = useDynamicProfile();
    const { userType } = useUserContext();
    const { setChannels } = useMyChannels();
    const {
        messages,
        clearMessages: clearChatMessages,
        addMessage,
        updateMessage,
        removeMessage,
        applyReadEvent,
    } = useChatMessages(dynamicProfile?.uid ?? null, channelId ?? null);

    const lastMessage = useWebSocketV2Store((s: { lastMessage: unknown }) => s.lastMessage);
    const { isIOS } = useAppChecker();

    useReadMessage(channelId, messages, applyReadEvent);

    useEffect(() => {
        if (lastMessage?.type !== 'model' || lastMessage.action !== 'update') return;
        const payload = lastMessage.payload as { reason?: string; channelId?: string } | undefined;
        if (payload?.reason !== 'channel-deleted' || payload.channelId !== channelId) return;
        setChannels(prev => prev.filter(ch => ch.id !== channelId));
        clearChatMessages();
        navigate('/', { replace: true });
    }, [lastMessage]);

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        if (messages.length > 0) {
            scrollToBottom();
        }
    }, [messages.length]);

    useEffect(() => {
        const handleResize = () => {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        };

        const handleFocus = () => {
            setTimeout(() => {
                scrollToBottom();
            }, 300);
        };

        window.addEventListener('resize', handleResize);
        inputRef.current?.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('resize', handleResize);
            inputRef.current?.removeEventListener('focus', handleFocus);
        };
    }, []);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
            inputRef.current.style.overflowY = inputRef.current.scrollHeight > 120 ? 'auto' : 'hidden';
        }
    }, [content]);

    const dispatchMessage = useCallback(
        (messageContent: string, targetChannelId: string) => {
            const tempId = `temp-${Date.now()}-${tempIdCounter.current++}`;
            const uid = dynamicProfile?.uid ?? '';

            addMessage(
                {
                    id: tempId,
                    content: messageContent,
                    timestamp: new Date(),
                    ownerId: uid,
                    ownerName: dynamicProfile?.name ?? '',
                    isRead: true,
                    status: 'pending',
                },
                targetChannelId
            );

            sendMessage(targetChannelId, messageContent, {
                tempId,
                onSuccess: (tid, chatView) => {
                    const resolved = { ...toClientChatView(chatView), isRead: true, status: undefined as const };
                    updateMessage(tid, () => resolved);

                    const chatNo = chatView.chatNo;
                    if (chatNo && uid) {
                        emit({ type: 'chat', action: 'read', payload: { channelId: targetChannelId, chatNo } });
                        applyReadEvent(chatNo, uid);
                    }

                    setChannels(prev =>
                        prev.map(ch =>
                            ch.id === targetChannelId
                                ? {
                                      ...ch,
                                      lastChat$: {
                                          ...chatView,
                                          id: chatView.id || '0',
                                          content: messageContent,
                                          createdAt: chatView.createdAt,
                                      },
                                  }
                                : ch
                        )
                    );
                },
                onError: tid => {
                    updateMessage(tid, msg => ({ ...msg, status: 'failed' }));
                    toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
                },
            });
        },
        [dynamicProfile, sendMessage, addMessage, updateMessage, emit, applyReadEvent, setChannels, toast, t]
    );

    const handleSend = useCallback(
        (e?: React.MouseEvent | React.KeyboardEvent) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            const trimmed = content.trim().slice(0, MAX_INPUT_LENGTH);
            if (!trimmed || !channelId) return;

            setContent('');
            dispatchMessage(trimmed, channelId);
        },
        [content, channelId, dispatchMessage]
    );

    const handleRetry = useCallback(
        (messageId: string) => {
            const failedMsg = messages.find(m => m.id === messageId);
            if (!failedMsg || !channelId) return;

            removeMessage(messageId);
            dispatchMessage(failedMsg.content, channelId);
        },
        [messages, channelId, removeMessage, dispatchMessage]
    );

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? t('chat.room.am') : t('chat.room.pm');
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const formatDateSeparator = (date: Date) => {
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

    const groupedMessages = messages.reduce(
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

    if (isLoading) {
        return <LoadingFallback message={t('chat.room.loading')} />;
    }

    if (isError) {
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
        <div className="flex  h-screen flex-col pt-safe-top bg-background ">
            {/* Header */}
            <header className="relative z-10 flex min-h-[48px] items-center justify-center border-b border-border px-4 py-3">
                <button onClick={() => navigate(-1)} className="absolute left-4 p-2">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">
                    {channel?.stereo === 'self' ? t('channelList.selfChannel') : channel?.name || t('chat.room.title')}
                    {channel?.stereo !== 'self' && channel?.memberNo && (
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{channel.memberNo}</span>
                    )}
                </h1>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="absolute right-4 p-1">
                            <MoreHorizontal size={22} className="text-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => navigate(`/chats/${channelId}/settings`)}
                            className="cursor-pointer gap-2"
                        >
                            <Settings size={16} />
                            <span>{t('home.settings')}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            {/* Messages */}
            <div
                ref={messagesEndRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2 overscroll-none"
            >
                {messages.length === 0 ? (
                    <div className="relative flex flex-1 flex-col items-center justify-center">
                        {/* Date */}
                        <div className="absolute left-0 right-0 top-2 text-center">
                            <span className="text-[13px] tracking-[-0.195px] text-muted-foreground">
                                {formatDateSeparator(new Date())}
                            </span>
                        </div>

                        {/* Empty state */}
                        <div className="flex flex-col items-center gap-4">
                            {userType !== UserType.TEMP_ACCOUNT && (
                                <div className="text-center text-[16px] leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                    <p>{t('chat.room.emptyState.line1')}</p>
                                    <p>{t('chat.room.emptyState.line2')}</p>
                                </div>
                            )}
                            {userType !== UserType.TEMP_ACCOUNT && (
                                <button
                                    onClick={() => setInviteDialogOpen(true)}
                                    className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-background"
                                >
                                    <Plus size={20} />
                                    <span className="text-[16px] font-semibold">
                                        {t('chat.room.emptyState.inviteButton')}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    Object.entries(groupedMessages)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([dateKey, dateMessages]) => (
                            <div key={dateKey} className="flex flex-col gap-3">
                                {/* Date Separator */}
                                <div className="py-2 text-center">
                                    <span className="text-[13px] tracking-[-0.195px] text-muted-foreground">
                                        {formatDateSeparator(dateMessages[0].timestamp)}
                                    </span>
                                </div>

                                {/* Messages for this date */}
                                {dateMessages
                                    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                                    .map(message => {
                                        const isMine = message.ownerId === dynamicProfile?.uid;

                                        if (message.isSystem) {
                                            const systemMatch = message.content.match(/^(.+?)(님이.+)$/);
                                            return (
                                                <div key={message.id} className="flex justify-center py-1">
                                                    <span className="rounded-full bg-foreground/5 px-2.5 py-1.5 text-sm text-foreground">
                                                        {systemMatch ? (
                                                            <>
                                                                <span className="font-semibold">{systemMatch[1]}</span>
                                                                {systemMatch[2]}
                                                            </>
                                                        ) : (
                                                            message.content
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={message.id}
                                                className={`flex gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                                            >
                                                {!isMine && (
                                                    <div className="flex size-[39px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                        <User className="size-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div
                                                    className={`flex max-w-[75%] flex-col ${isMine ? 'items-end' : 'items-start'}`}
                                                >
                                                    {!isMine && (
                                                        <span className="mb-1 text-xs text-muted-foreground">
                                                            {message.ownerName}
                                                        </span>
                                                    )}
                                                    <MessageBubble
                                                        content={message.content}
                                                        isMine={isMine}
                                                        status={message.status}
                                                        onViewAll={() =>
                                                            setExpandedMessage({
                                                                content: message.content,
                                                                ownerName: message.ownerName,
                                                            })
                                                        }
                                                    />
                                                    {message.status === 'pending' ? (
                                                        <div className="mt-1 flex items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                                                            <Loader2 size={12} className="animate-spin" />
                                                            <span>{t('chat.room.sending')}</span>
                                                        </div>
                                                    ) : message.status === 'failed' ? (
                                                        <button
                                                            onClick={() => handleRetry(message.id)}
                                                            className="mt-1 flex items-center gap-1 text-[11px] leading-4 text-destructive"
                                                        >
                                                            <RotateCcw size={12} />
                                                            <span>{t('chat.room.tapToRetry')}</span>
                                                        </button>
                                                    ) : (
                                                        <div
                                                            className={`mt-1 flex items-center gap-1.5 text-[11px] leading-4 ${isMine ? 'flex-row-reverse' : ''}`}
                                                        >
                                                            <span className="text-muted-foreground">
                                                                {formatTime(message.timestamp)}
                                                            </span>
                                                            <ReadStatus
                                                                memberNo={channel?.memberNo ?? 0}
                                                                readCount={(message.readBy?.length ?? 1) - 1}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        ))
                )}
            </div>

            {userType !== UserType.TEMP_ACCOUNT && (
                <InviteFriendsDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} channelId={channelId} />
            )}

            {/* Input */}
            <div
                className="border-t border-border bg-background px-4 py-3"
                style={{
                    paddingBottom: isIOS
                        ? `calc(12px + max(var(--safe-bottom, 0px), var(--keyboard-height, 0px)))`
                        : `calc(12px + var(--safe-bottom, 0px) + var(--keyboard-height, 0px))`,
                }}
            >
                <div className="flex items-end gap-1.5 rounded-2xl bg-muted px-3 py-1.5">
                    <textarea
                        ref={inputRef}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder={t('chat.room.inputPlaceholder')}
                        rows={1}
                        enterKeyHint="enter"
                        className="max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                        onMouseDown={e => e.preventDefault()}
                        onTouchStart={e => e.preventDefault()}
                        onClick={handleSend}
                        disabled={!content.trim()}
                        className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                            content.trim()
                                ? 'bg-foreground text-background'
                                : 'bg-muted-foreground/20 text-muted-foreground'
                        }`}
                    >
                        <ArrowUp size={18} />
                    </button>
                </div>
            </div>

            {/* Message Detail Modal */}
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
