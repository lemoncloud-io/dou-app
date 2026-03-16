import { ArrowUp, ChevronLeft, MoreHorizontal, Plus, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/page-transition';

import { LoadingFallback } from '@chatic/shared';
import { useDynamicProfile, useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { useSendMessage } from '../hooks/useSendMessage';
import { useMyChannel } from '../hooks/useMyChannel';
import { useReadMessage } from '../hooks/useReadMessage';
import { useChatMessages } from '../hooks/useChatMessages';
import { useMyChannels } from '../../home/hooks/useMyChannels';
import { InviteFriendsDialog } from '../components/InviteFriendsDialog';
import { MessageBubble } from '../components/MessageBubble';
import { ReadStatus } from '../components/ReadStatus';

export const ChatRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { channelId } = useParams<{ channelId: string }>();
    const [content, setContent] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { emit } = useWebSocketV2();
    const { sendMessage, isPending } = useSendMessage();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const { channel, isLoading, isError } = useMyChannel(channelId ?? null);

    const dynamicProfile = useDynamicProfile();
    const { isGuest } = useWebCoreStore();
    const { setChannels } = useMyChannels();
    const {
        messages,
        clearMessages: clearChatMessages,
        addMessage,
        applyReadEvent,
    } = useChatMessages(dynamicProfile?.uid ?? null, channelId ?? null);

    const lastMessage = useWebSocketV2Store((s: { lastMessage: unknown }) => s.lastMessage);

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

    const handleSend = async (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!content.trim() || !channelId || isPending) return;

        setContent('');

        try {
            const newMessage = await sendMessage(channelId, content.trim());

            const id = newMessage.id || '0';
            const timestamp = newMessage?.createdAt ? new Date(newMessage.createdAt) : new Date();
            const ownerId = newMessage.ownerId || '';
            const ownerName = newMessage.owner$?.name || t('chat.room.unknown');
            const chatNo = newMessage?.chatNo;

            addMessage({ id, content: content.trim(), timestamp, ownerId, ownerName, chatNo, isRead: true }, channelId);

            if (chatNo && dynamicProfile?.uid) {
                emit({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
                applyReadEvent(chatNo, dynamicProfile.uid);
            }
            setChannels(prev =>
                prev.map(ch =>
                    ch.id === channelId
                        ? {
                              ...ch,
                              lastChat$: {
                                  ...newMessage,
                                  id,
                                  content: content.trim(),
                                  createdAt: newMessage.createdAt,
                              },
                          }
                        : ch
                )
            );
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (isComposing) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend(e);
        }
    };

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
        <div className="flex h-screen flex-col bg-background pb-safe-bottom">
            {/* Header */}
            <header className="z-10 flex items-center justify-between border-b border-border px-4 py-4">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-bold text-foreground">
                    {channel?.name || t('chat.room.title')}
                    {channel?.memberNo && (
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{channel.memberNo}</span>
                    )}
                </h1>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-1">
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
            <div ref={messagesEndRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2">
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
                            {!isGuest && (
                                <div className="text-center text-[16px] leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                    <p>{t('chat.room.emptyState.line1')}</p>
                                    <p>{t('chat.room.emptyState.line2')}</p>
                                </div>
                            )}
                            {!isGuest && (
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
                    Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
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
                                                <img
                                                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${message.ownerId}`}
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="size-[39px] flex-shrink-0 rounded-full bg-muted object-cover"
                                                />
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
                                                    onViewAll={() =>
                                                        setExpandedMessage({
                                                            content: message.content,
                                                            ownerName: message.ownerName,
                                                        })
                                                    }
                                                />
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
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ))
                )}
            </div>

            {!isGuest && (
                <InviteFriendsDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} channelId={channelId} />
            )}

            {/* Input */}
            <div
                className="border-t border-border bg-background px-4 py-3 mb-safe-bottom"
                style={{ paddingBottom: 'calc(12px + var(--safe-bottom, 0px))' }}
            >
                <div className="flex items-end gap-1.5 rounded-2xl bg-muted px-3 py-1.5">
                    <textarea
                        ref={inputRef}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        onKeyDown={handleKeyPress}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        placeholder={t('chat.room.inputPlaceholder')}
                        rows={1}
                        enterKeyHint="send"
                        className="max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                        onMouseDown={e => e.preventDefault()}
                        onTouchStart={e => e.preventDefault()}
                        onClick={handleSend}
                        disabled={isPending}
                        className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                            content.trim()
                                ? 'bg-foreground text-background'
                                : 'bg-muted-foreground/30 text-muted-foreground'
                        }`}
                    >
                        {isPending ? (
                            <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                            <ArrowUp size={18} />
                        )}
                    </button>
                </div>
            </div>

            {/* Message Detail Modal */}
            <Dialog open={!!expandedMessage} onOpenChange={open => !open && setExpandedMessage(null)}>
                <DialogContent variant="slide-up" hideClose className="flex flex-col gap-0 bg-background">
                    <DialogDescription className="sr-only">View full message content</DialogDescription>
                    {/* Modal Header */}
                    <header className="flex items-center justify-between border-b border-border px-4 py-4">
                        <div className="w-8" />
                        <DialogTitle className="text-[17px] font-bold text-foreground">
                            {t('chat.room.messageDetail')}
                        </DialogTitle>
                        <button onClick={() => setExpandedMessage(null)} className="p-1">
                            <X size={24} className="text-foreground" />
                        </button>
                    </header>

                    {/* Modal Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <p className="whitespace-pre-wrap break-all text-[16px] leading-[1.5] text-foreground">
                            {expandedMessage?.content}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
