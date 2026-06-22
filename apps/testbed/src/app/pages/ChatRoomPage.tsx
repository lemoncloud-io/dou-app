import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainChat } from '@chatic/data';

export const ChatRoomPage = () => {
    const { channelId } = useParams<{ channelId: string }>();
    const navigate = useNavigate();
    // Cast to V2 — app-runtime dist is stale (V1 return type), source is V2
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    const [chats, setChats] = useState<DomainChat[]>([]);
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const listRef = useRef<HTMLDivElement>(null);
    const prevScrollHeight = useRef(0);

    if (!channelId) return null;

    // 채팅 목록 구독
    useEffect(() => {
        setChats([]);
        setHasMore(true);
        return repos.chat.observeList({ channelId }, result => {
            setChats(result?.list ?? []);
        });
    }, [repos.chat, channelId]);

    // 최초 로드
    useEffect(() => {
        void repos.chat.refreshList({ channelId });
    }, [repos.chat, channelId]);

    // 새 메시지 오면 하단 스크롤
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (isNearBottom) {
            el.scrollTop = el.scrollHeight;
        }
    }, [chats.length]);

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore) return;
        const oldest = chats[0];
        if (!oldest) return;

        setIsLoadingMore(true);
        prevScrollHeight.current = listRef.current?.scrollHeight ?? 0;

        try {
            const result = await repos.chat.refreshList({
                channelId,
                cursorNo: oldest.chatNo,
            });
            if (result.wroteCount === 0) setHasMore(false);
        } finally {
            setIsLoadingMore(false);
            // 스크롤 앵커 유지
            requestAnimationFrame(() => {
                const el = listRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight - prevScrollHeight.current;
            });
        }
    }, [repos.chat, channelId, chats, isLoadingMore, hasMore]);

    const handleScroll = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        if (el.scrollTop < 60) {
            void loadMore();
        }
    }, [loadMore]);

    const handleSend = async () => {
        if (!message.trim() || isSending) return;
        const text = message.trim();
        setMessage('');
        setIsSending(true);
        try {
            await repos.chat.sendChat({ channelId, content: text });
        } catch {
            setMessage(text);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
                <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
                    ←
                </button>
                <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{channelId}</p>
                </div>
            </div>

            {/* 메시지 목록 */}
            <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                {isLoadingMore && <p className="text-center text-xs text-muted-foreground py-2">불러오는 중...</p>}
                {!hasMore && chats.length > 0 && (
                    <p className="text-center text-xs text-muted-foreground py-2">처음 메시지입니다</p>
                )}
                {chats.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">메시지가 없습니다</p>
                ) : (
                    chats.map(chat => <ChatBubble key={chat.id} chat={chat} />)
                )}
            </div>

            {/* 입력 영역 */}
            <div className="flex gap-2 px-3 py-3 border-t border-border bg-card shrink-0">
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="메시지를 입력하세요"
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                    onClick={() => void handleSend()}
                    disabled={!message.trim() || isSending}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-opacity"
                >
                    전송
                </button>
            </div>
        </div>
    );
};

const ChatBubble = ({ chat }: { chat: DomainChat }) => {
    const time = new Date(chat.createdAtMs).toLocaleTimeString('ko', {
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-end gap-1.5">
                <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        chat.isPending ? 'bg-muted text-muted-foreground' : 'bg-card border border-border'
                    }`}
                >
                    <p className="text-xs text-muted-foreground mb-0.5 font-mono">{chat.id?.slice(0, 8)}</p>
                    <p className="break-words">{chat.content}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mb-1">{time}</span>
                {chat.isPending && <span className="text-[10px] text-muted-foreground shrink-0 mb-1">전송중</span>}
            </div>
        </div>
    );
};
