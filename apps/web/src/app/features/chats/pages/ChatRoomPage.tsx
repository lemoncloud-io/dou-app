import { ChevronLeft, Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSendPublicMessage } from '@chatic/chats';
import { publicChannelsKeys, useLeavePublicChannel } from '@chatic/channels';
import { useWebSocketV2 } from '@chatic/socket';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { useSimpleWebCore } from '@chatic/web-core';
import { useQueryClient } from '@tanstack/react-query';
import type { ListResult } from '@chatic/shared';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import { useChatMessages } from '../hooks/useChatMessages';
import { useReadMessage } from '../hooks/useReadMessage';

export const ChatRoomPage = () => {
    const navigate = useNavigate();
    const { channelId } = useParams<{ channelId: string }>();
    const [content, setContent] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const subscribedRef = useRef(false);
    const { mutateAsync: sendMessage, isPending } = useSendPublicMessage();
    const { mutateAsync: leaveChannel } = useLeavePublicChannel();
    const { send, lastMessage } = useWebSocketV2();
    const { profile } = useSimpleWebCore();
    const {
        messages,
        clearMessages: clearChatMessages,
        addMessage,
    } = useChatMessages(profile?.id ?? null, channelId ?? null);

    const queryClient = useQueryClient();

    useReadMessage(channelId);

    const handleLeaveRoom = async () => {
        if (!channelId) return;

        try {
            await leaveChannel({ id: channelId, body: {} });
            await clearChatMessages();
            queryClient.setQueryData<ListResult<ChannelView>>(publicChannelsKeys.list({ limit: -1 }), old => {
                if (!old) {
                    return {
                        list: [],
                        total: 1,
                        page: 0,
                        limit: -1,
                    };
                }
                return {
                    ...old,
                    list: old.list.filter(item => item.id !== channelId),
                    total: (old.total || 1) - 1,
                };
            });

            navigate(-1);
        } catch (error) {
            console.error('Failed to leave room:', error);
        }
    };

    useEffect(() => {
        if (channelId && !subscribedRef.current) {
            subscribedRef.current = true;
            send({
                type: 'channel',
                action: 'subscribe',
                payload: {
                    channels: [channelId],
                },
            });
        }
    }, [channelId, send]);

    // 1초 후에도 ready가 안되면 다시 send
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isReady && channelId) {
                send({
                    type: 'channel',
                    action: 'subscribe',
                    payload: {
                        channels: [channelId],
                    },
                });
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [channelId, send, isReady]);

    useEffect(() => {
        if (lastMessage?.type === 'channel' && lastMessage?.action === 'subscribe') {
            setIsReady(true);
            return;
        }
    }, [lastMessage]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 입력창 크기 조절 훅
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [content]);

    const handleSend = async (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!content.trim() || !channelId || isPending || !isReady) return;

        setContent('');

        requestAnimationFrame(() => {
            scrollToBottom();
        });

        try {
            const newMessage = await sendMessage({
                channelId,
                content: content,
            });

            const id = newMessage.id || '0';

            const timestamp = newMessage?.createdAt ? new Date(newMessage.createdAt) : new Date();
            const ownerId = newMessage.ownerId || '';
            const ownerName = newMessage.owner$?.name || '알 수 없음';
            const readCount = newMessage?.readCount ?? 0;

            await addMessage(
                {
                    id,
                    content: content,
                    timestamp,
                    ownerId,
                    ownerName,
                    readCount,
                },
                channelId
            );
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (isComposing) return;

        // `Enter`와 `Shift`를 동시에 누르지 않을때만 진행
        if (e.key === 'Enter' && !e.shiftKey) {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                return;
            }

            // PC의 기본 동작인 줄바꿈이 실행되지 않고, 전송 수행
            e.preventDefault();
            void handleSend(e);
        }
    };

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? '오전' : '오후';
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const formatDateSeparator = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const weekday = weekdays[date.getDay()];
        return `${year}년 ${month}월 ${day}일 ${weekday}`;
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

    if (!isReady) {
        return (
            <div className="flex h-full items-center justify-center bg-white">
                <div className="w-8 h-8 border-4 border-[#B0EA10] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-white">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                <button onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center">
                    <ChevronLeft className="w-6 h-6 text-[#3A3C40]" />
                </button>
                <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#171725]">채팅방</h1>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="w-11 h-11 flex items-center justify-center">
                            <Ellipsis className="w-6 h-6 text-[#3A3C40]" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                            onClick={() => navigate(`/chats/${channelId}/settings`)}
                            className="cursor-pointer"
                        >
                            <span>설정</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLeaveRoom} className="cursor-pointer text-destructive">
                            <span>방 나가기</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-1 px-[18px] py-3">
                <div className="flex items-center gap-[-6px]">{/* Placeholder for participant avatars */}</div>
                {/* <span className="text-[14px] font-medium leading-[1.857] tracking-[0.005em] text-[#84888F]">+22</span> */}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-[18px] py-3 flex flex-col gap-3.5">
                {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
                    <div key={dateKey} className="flex flex-col gap-3.5">
                        {/* Date Separator */}
                        <div className="flex items-center justify-center gap-2.5 px-4 py-2">
                            <div className="flex items-center justify-center gap-2.5 px-2 py-1 bg-[#F4F5F5] rounded-[7px]">
                                <span className="text-[11px] font-medium text-[#84888F]">
                                    {formatDateSeparator(dateMessages[0].timestamp)}
                                </span>
                            </div>
                        </div>

                        {/* Messages for this date */}
                        {dateMessages
                            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                            .map(message => {
                                const isMine = message.ownerId === profile?.id;
                                return isMine ? (
                                    <div key={message.id} className="flex flex-col items-end gap-1">
                                        <div className="flex items-end gap-2">
                                            <span className="text-[11px] font-normal leading-[1.4] tracking-[0.005em] text-[#9CA4AB]">
                                                {formatTime(message.timestamp)}
                                            </span>
                                            <div className="flex items-center gap-2 px-3 py-3 bg-[#102346] rounded-[14px_14px_0px_14px] max-w-[269px]">
                                                <span className="text-[14px] font-normal leading-[1.3] text-white">
                                                    {message.content}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div key={message.id} className="flex flex-col gap-1">
                                        <div className="flex gap-2">
                                            <div className="flex h-[39px] w-[39px] items-center justify-center rounded-full bg-[#F4F5F5]" />
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] font-medium text-[#84888F]">
                                                    {message.ownerName}
                                                </span>
                                                <div className="flex items-center gap-2 px-6 py-3 bg-[#F6F6F6] rounded-[0px_14px_14px_14px]">
                                                    <span className="text-[14px] font-normal leading-[1.3] text-[#171725]">
                                                        {message.content}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 pl-[47px]">
                                            <span className="text-[11px] font-normal leading-[1.4] tracking-[0.005em] text-[#9CA4AB]">
                                                {formatTime(message.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-2.5 px-4 py-3">
                <div className="flex items-end gap-1.5 px-1.5 py-1.5 bg-[#F4F5F5] rounded-2xl">
                    <div className="flex-1 flex items-center gap-1.5 px-1.5 min-h-[40px]">
                        <textarea
                            ref={inputRef}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            onKeyDown={handleKeyPress}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                            placeholder="메시지를 입력해 주세요"
                            rows={1}
                            enterKeyHint="enter"
                            className="flex-1 bg-transparent border-0 outline-none text-[14px] font-normal leading-[1.45] tracking-[-0.02em] text-[#9CA4AB] placeholder:text-[#9CA4AB] disabled:opacity-50 resize-none py-1 max-h-[120px] overflow-y-auto"
                        />
                    </div>
                    <button
                        onMouseDown={e => e.preventDefault()}
                        onTouchStart={e => e.preventDefault()}
                        onClick={handleSend}
                        disabled={isPending || !content.trim()}
                        className="flex items-center justify-center gap-2.5 w-10 h-10 bg-[#CFD0D3] rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                                <path
                                    d="M13 1L6.5 7.5M13 1L9 13L6.5 7.5M13 1L1 5L6.5 7.5"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
