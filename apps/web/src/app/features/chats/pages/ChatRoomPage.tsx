import { ArrowUp, ChevronLeft, Loader2, MoreHorizontal, PenLine, Plus, Settings, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useDynamicProfile, useUserContext, UserType } from '@chatic/web-core';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useAppChecker } from '@chatic/device-utils';

import { InviteFriendsDialog } from '../components';
import { MessageBubble } from '../components/MessageBubble';
import { ReadStatus } from '../components/ReadStatus';
import type { ClientChatView } from '@chatic/socket-data';
import {
    useChannelMembers,
    useChannel,
    useChatMutations,
    useChats,
    FOREGROUND_RESYNC_EVENT_NAME,
} from '@chatic/socket-data';

// 입력 가능한 최대 글자 수
const MAX_INPUT_LENGTH = 5000;

export const ChatRoomPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const { channelId } = useParams<{ channelId: string }>();

    // UI 상태 관리
    const [content, setContent] = useState(''); // 현재 입력 중인 메시지
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false); // 초대 모달 상태
    const [expandedMessage, setExpandedMessage] = useState<{ content: string; ownerName: string } | null>(null); // 긴 메시지 상세보기 상태

    // DOM 접근을 위한 Ref
    const messagesEndRef = useRef<HTMLDivElement>(null); // 스크롤 컨테이너
    const inputRef = useRef<HTMLTextAreaElement>(null); // 텍스트 입력창

    // 중복 읽음 처리(read 요청)를 방지하기 위해 마지막으로 읽음 처리한 메시지 번호를 저장
    const lastReadChatNoRef = useRef<number | null>(null);

    const dynamicProfile = useDynamicProfile();
    const { userType } = useUserContext();
    const { isIOS } = useAppChecker();

    // 데이터 패칭 Hooks
    useChannelMembers({ channelId: channelId || '', detail: true }); // 멤버 정보 패칭
    const { channel, isLoading: isChannelLoading, isError: isChannelError } = useChannel(channelId || null); // 현재 채널 정보 패칭
    const {
        messages,
        isLoading: isChatLoading,
        isError: isChatError,
    } = useChats({
        channelId: channelId || '',
        limit: 100,
    });

    // 메시지 전송 및 읽음 처리 관련 Mutation
    const { isPending, sendMessage, readMessage, deleteMessage } = useChatMutations();
    const isSending = isPending.send;

    useEffect(() => {
        // 채널 정보를 불러오는 중이면 대기
        if (isChannelLoading) return;
        // 로딩이 완료되었으나 채널 정보가 없거나 에러가 발생한 경우 방을 나감
        if (!channel || isChannelError) {
            void navigate('/', { replace: true });
        }
    }, [channel, isChannelLoading, isChannelError, navigate]);

    // column-reverse 컨테이너에서 scrollTop=0이 최하단(최신 메시지)
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

    // 채팅 길이가 변할 때 최신 메시지 자동 읽음 처리
    useEffect(() => {
        if (!channelId || messages.length === 0) return;

        const handleAutoRead = () => {
            // 웹 브라우저나 앱이 완전히 백그라운드에 있을 때는 무시
            if (document.visibilityState === 'hidden') return;

            // 목록의 가장 마지막 메시지 추출
            const latestMessage = messages[messages.length - 1];
            const latestChatNo = latestMessage?.chatNo;

            // 서버에서 확정된 번호가 있고, 내가 마지막으로 읽은 번호보다 최신일 때만 실행
            if (
                latestChatNo !== undefined &&
                (lastReadChatNoRef.current === null || latestChatNo > lastReadChatNoRef.current)
            ) {
                lastReadChatNoRef.current = latestChatNo;
                readMessage({ channelId, chatNo: latestChatNo }).catch(console.error);
            }
        };

        // 새 메시지가 도착했을 때 즉시 체크
        handleAutoRead();
        // PC 웹 / 모바일 브라우저 탭 활성화 대응
        document.addEventListener('visibilitychange', handleAutoRead);
        // 모바일 네이티브 앱(웹뷰) 포그라운드 복귀 대응 (useForegroundResync 연동)
        window.addEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleAutoRead);

        return () => {
            document.removeEventListener('visibilitychange', handleAutoRead);
            window.removeEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleAutoRead);
        };
    }, [messages.length, channelId, readMessage]);

    // 새 메시지 추가 시에만 스크롤 (초기 로드는 column-reverse가 자동 처리)
    const prevMessageCountRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMessageCountRef.current) {
            scrollToBottom(false);
        }
        prevMessageCountRef.current = messages.length;
    }, [messages.length]);

    // 창 크기 변경(키보드 올라옴 등) 및 인풋 포커스 시 스크롤 조정 이벤트 등록
    useEffect(() => {
        // 키보드 애니메이션(~300ms) 완료 후 스크롤 보정
        const handleScrollAdjust = () => setTimeout(() => scrollToBottom(), 150);
        const input = inputRef.current;

        window.addEventListener('resize', handleScrollAdjust);
        input?.addEventListener('focus', handleScrollAdjust);

        return () => {
            window.removeEventListener('resize', handleScrollAdjust);
            input?.removeEventListener('focus', handleScrollAdjust);
        };
    }, []);

    // 텍스트 영역의 내용 길이에 따라 자동으로 높이를 조절하는 로직 (최대 120px)
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
            inputRef.current.style.overflowY = inputRef.current.scrollHeight > 120 ? 'auto' : 'hidden';
        }
    }, [content]);

    /**
     * 메시지 전송 핸들러
     */
    const handleSend = () => {
        const trimmed = content.trim().slice(0, MAX_INPUT_LENGTH);
        if (!trimmed || !channelId) return;

        // UI 즉각 반응을 위해 입력창 비우고 에러 메시지 초기화
        setContent('');

        // 백그라운드로 메시지 전송 요청 (내부적으로 로컬 DB 선저장되어 낙관적 업데이트 발동)
        sendMessage({ channelId, content: trimmed })
            .then(newChat => {
                // 서버 응답 성공 시 발급받은 번호로 내 메시지 읽음 처리
                if (newChat && newChat.chatNo !== undefined) {
                    lastReadChatNoRef.current = newChat.chatNo;
                    readMessage({ channelId, chatNo: newChat.chatNo }).catch(console.error);
                }
            })
            .catch(error => {
                console.error('Failed to send message:', error);
                // 실패 시 입력했던 텍스트를 복구할 수 있도록 상태 저장
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    /**
     * 메시지 삭제 처리 (실패한 메시지 삭제)
     * @param messageId 타겟 메시지 아이디
     */
    const handleDeleteMessage = async (messageId?: string) => {
        if (!channelId || !messageId) {
            return;
        }
        await deleteMessage(messageId, channelId);
    };

    const handleRetryMessage = async (message: ClientChatView) => {
        if (!channelId || !message.id) {
            return;
        }
        handleDeleteMessage(message.id)
            .then(() => {
                return sendMessage({ channelId, content: message.content ?? '' });
            })
            .then(newChat => {
                if (newChat && newChat.chatNo !== undefined) {
                    lastReadChatNoRef.current = newChat.chatNo;
                    readMessage({ channelId, chatNo: newChat.chatNo }).catch(console.error);
                }
            })
            .catch(error => {
                console.error('Failed to send message:', error);
            });
    };

    /**
     * 텍스트 영역 키보드 입력 핸들러
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // IME(한글 등) 조합 중 중복 발생 방지
        if (e.nativeEvent.isComposing) return;

        // 모바일 환경이면 엔터 키를 줄바꿈(기본 동작)으로만 사용하도록 이벤트 통과
        if (isMobile && e.key === 'Enter') {
            return;
        }

        // PC 환경이면 Shift 없이 Enter만 눌렀을 때 전송
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // 날짜 및 시간 포맷팅 헬퍼 함수
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

    // 메시지 목록을 날짜 단위로 그룹화
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

    // 에러 처리
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
        <div className="flex h-screen flex-col pt-safe-top bg-background">
            {/* 상단 헤더 영역 */}
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
                {!channel?.isSelfChat && (
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
                )}
            </header>

            {/* 메시지 목록 렌더링 영역 — column-reverse로 초기 스크롤 위치를 하단에 고정 */}
            <div ref={messagesEndRef} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-none">
                <div
                    className={`flex flex-col gap-3 px-4 pb-4 pt-2 ${messages.length === 0 && !isChatLoading ? 'min-h-full' : ''}`}
                >
                    {messages.length === 0 && !isChatLoading ? (
                        // 메시지가 없을 때 보여지는 빈 화면 (Empty State)
                        <div className="relative flex flex-1 flex-col items-center justify-center">
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
                                    channel?.ownerId === dynamicProfile?.uid && (
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
                        // 날짜별로 그룹화된 메시지 렌더링
                        Object.entries(groupedMessages)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([dateKey, dateMessages]) => (
                                <div key={dateKey} className="flex flex-col gap-3">
                                    {/* 날짜 구분선 */}
                                    <div className="py-2 text-center">
                                        <span className="text-[13px] tracking-[-0.195px] text-muted-foreground">
                                            {formatDateSeparator(dateMessages[0].timestamp)}
                                        </span>
                                    </div>

                                    {dateMessages.map(message => {
                                        // 시스템 메시지 렌더링 (초대, 퇴장 등)
                                        if (message.isSystem) {
                                            const systemMatch = (message.content ?? '').match(/^(.+?)(님이.+)$/);
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

                                        // 일반 메시지 렌더링
                                        return (
                                            <div
                                                key={message.id}
                                                className={`flex gap-1.5 ${message.isOwner ? 'justify-end' : 'justify-start'} ${
                                                    message.isPending ? 'opacity-60 transition-opacity' : ''
                                                }`}
                                            >
                                                {!message.isOwner && (
                                                    <div className="flex size-[39px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                                                        <User className="size-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div
                                                    className={`flex max-w-[75%] flex-col ${message.isOwner ? 'items-end' : 'items-start'}`}
                                                >
                                                    {!message.isOwner && (
                                                        <span className="mb-1 text-xs text-muted-foreground">
                                                            {message.ownerName}
                                                        </span>
                                                    )}
                                                    <MessageBubble
                                                        content={message.content ?? ''}
                                                        isMine={message.isOwner}
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
                                                                          content: message.content ?? '',
                                                                          ownerName: message.ownerName,
                                                                      })
                                                        }
                                                    />
                                                    {!message.isPending && (
                                                        <div
                                                            className={`mt-1 flex items-center gap-1.5 text-[11px] leading-4 ${message.isOwner ? 'flex-row-reverse' : ''}`}
                                                        >
                                                            <span className="text-muted-foreground">
                                                                {formatTime(message.timestamp)}
                                                            </span>
                                                            {!message.isFailed && message.chatNo !== undefined && (
                                                                <ReadStatus
                                                                    unreadCount={message.unreadCount ?? 0}
                                                                    memberNo={channel?.memberNo ?? 0}
                                                                />
                                                            )}
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
            </div>

            {/* 초대 모달 */}
            {userType !== UserType.TEMP_ACCOUNT && !channel?.isSelfChat && (
                <InviteFriendsDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} channelId={channelId} />
            )}

            {/* 입력창 영역 */}
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
                        className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
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
                    </button>
                </div>
            </div>

            {/* 내용이 긴 메시지의 상세보기 모달 */}
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
