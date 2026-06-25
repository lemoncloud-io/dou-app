import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';
import {
    getSyncManager,
    useChannelSync,
    useChatSync,
    useJoinSync,
    useRuntimeRepositories,
    useSocketState,
} from '@chatic/app-runtime';
import type {
    DataRepositoriesV2,
    DomainChannel,
    DomainChat,
    DomainJoin,
    DomainProfile,
    DomainUser,
} from '@chatic/data';
import { metricsCollector } from '../metrics/MetricsCollector';
import { useRenderCount } from '../metrics/useRuntimeMetrics';
import { InviteCreateDialog } from '../features/invite/InviteCreateDialog';

// Messages per page. The observe window grows by this on each older-page load so the
// cache-scoped observeList (which returns only the newest `limit`) widens to include them.
const PAGE_SIZE = 50;

// Short HH:MM, tolerating missing/odd timestamps.
const formatChatTime = (ms?: number): string => {
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' });
};

export const ChatRoomPage = () => {
    const { channelId } = useParams<{ channelId: string }>();
    const navigate = useNavigate();
    // Cast to V2 — app-runtime dist is stale (V1 return type), source is V2
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    const identity = useSessionIdentity();
    const { selectedSiteId } = useSessionSelection();
    const myUid = identity.userId ?? '';
    const { isVerified } = useSocketState();

    const [chats, setChats] = useState<DomainChat[]>([]);
    const [channel, setChannel] = useState<DomainChannel | null>(null);
    // Member identity (name/avatar) and read-state, observed per channel, for message rendering.
    const [users, setUsers] = useState<DomainUser[]>([]);
    const [profiles, setProfiles] = useState<DomainProfile[]>([]);
    const [joins, setJoins] = useState<DomainJoin[]>([]);
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageLimit, setPageLimit] = useState(PAGE_SIZE); // observe window size, grows on loadMore
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    const listRef = useRef<HTMLDivElement>(null);
    // Per-room scroll/read guards (reset on channel change):
    const hasInitialScrolledRef = useRef(false); // bottom-align once on first page
    const lastReadSentRef = useRef(0); // high-water chatNo already marked read
    const forceBottomRef = useRef(false); // force bottom after our own send
    const pagingAnchorRef = useRef<number | null>(null); // pre-paging scrollHeight to anchor to
    const wasNearBottomRef = useRef(true); // user is near the bottom (follow new messages)

    if (!channelId) return null;

    useRenderCount('ChatRoom');

    // 채팅 메시지(실시간 append + 초기 prime)와 채널 메타를 sync 타깃으로 등록.
    // 초기 로딩 fetch는 sync 등록 계층이 소유하므로 페이지는 refreshList를 호출하지 않는다.
    useChatSync(channelId);
    useChannelSync(channelId);

    // join(read-state) 등록 — 훅이 channelId로 내 joinId를 해석해 registerJoin 한다.
    useJoinSync(channelId);

    // 채널 메타 구독 — register가 channel.get을 채워 넣고 polling으로 갱신한다.
    useEffect(() => {
        return repos.channel.observeItem(channelId, setChannel);
    }, [repos.channel, channelId]);

    // 방이 바뀌면 스크롤/읽음 가드 + 페이징 상태를 초기화한다(새 진입으로 취급).
    useEffect(() => {
        hasInitialScrolledRef.current = false;
        lastReadSentRef.current = 0;
        forceBottomRef.current = false;
        pagingAnchorRef.current = null;
        setChats([]);
        setHasMore(true);
        setPageLimit(PAGE_SIZE);
    }, [channelId]);

    // 채팅 목록 구독 — observeList는 최신 `limit`개만 반환하므로(ChatQueryExecutor가 chat_no
    // 역순 cursor 페이징), 과거를 더 보려면 윈도우(limit)를 키워야 한다. pageLimit이 커지면
    // 재구독되어 캐시에 이미 적재된 과거 메시지까지 포함해 다시 읽는다.
    useEffect(() => {
        return repos.chat.observeList({ channelId, limit: pageLimit }, result => {
            const list = result?.list ?? [];
            setChats(list);
            metricsCollector.reportChat(channelId, list);
        });
    }, [repos.chat, channelId, pageLimit]);

    // 멤버 user 캐시 구독(이름/프사 fallback) + join 캐시 구독(멤버별 readNo로 안읽음 계산).
    useEffect(() => {
        return repos.user.observeList({ channelId }, r => setUsers(r?.list ?? []));
    }, [repos.user, channelId]);

    // 채널 유저 목록 네트워크 로드(channel.listUser → user 캐시). 멤버 프로필 등록의 소스가 된다.
    // 네트워크 콜은 현재 세션에 종속되므로 isVerified 후에 실행한다(재인증/재진입 시 자동 재시도).
    useEffect(() => {
        if (!isVerified) return;
        void repos.user.refreshList({ channelId }).catch(() => {
            // best-effort; 캐시 스트림은 실패해도 유지된다
        });
    }, [repos.user, channelId, isVerified]);
    useEffect(() => {
        return repos.join.observeList({ channelId }, r => setJoins(r?.list ?? []));
    }, [repos.join, channelId]);

    // site profile 구독(닉/프사, 프로필 우선). 프로필은 sid 스코프라 채널 sid가 정해진 뒤 구독한다.
    const sid = channel?.sid ?? selectedSiteId;
    useEffect(() => {
        if (!sid) {
            setProfiles([]);
            return;
        }
        return repos.profile.observeList({ sid }, r => setProfiles(r?.list ?? []));
    }, [repos.profile, sid]);

    // ownerId(uid) → user / profile 조회 맵.
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
    const profileMap = useMemo(() => new Map(profiles.map(p => [p.userId ?? p.uid, p])), [profiles]);

    // 메시지별 "안읽은 인원수": 보낸이를 뺀 멤버 중 readNo가 해당 chatNo 미만인 수.
    const countUnread = (chat: DomainChat): number =>
        joins.filter(j => j.userId !== chat.ownerId && (j.readNo ?? 0) < chat.chatNo).length;

    useEffect(() => {
        if (!isVerified || !sid) return;
        let disposed = false;
        let disposers: Array<() => void> = [];

        void (async () => {
            try {
                await repos.user.refreshList({ channelId });
            } catch {
                // best-effort; cacheReadList below still uses whatever is locally available
            }
            try {
                await repos.join.refreshList({ channelId, activeOnly: false });
            } catch {
                // best-effort; other sources below still participate
            }

            const [userResult, joinResult] = await Promise.all([
                repos.user.cacheReadList({ channelId }),
                repos.join.cacheReadList({ channelId, activeOnly: false }),
            ]);
            if (disposed) return;

            const memberUserIds = new Set<string>();
            for (const user of userResult?.list ?? []) {
                if (user.id) memberUserIds.add(user.id);
            }
            for (const join of joinResult?.list ?? []) {
                if (join.userId) memberUserIds.add(join.userId);
            }
            for (const memberId of channel?.memberIds ?? []) {
                if (memberId) memberUserIds.add(memberId);
            }
            for (const chat of chats) {
                if (chat.ownerId) memberUserIds.add(chat.ownerId);
            }
            if (myUid) memberUserIds.add(myUid);

            // Register profile sync only for members that ALREADY have a valid cached profile.
            // The site's profile list is pre-synced upstream (ChatHomePage place refresh →
            // profile.sync), so we never trigger a per-member profile.get here for users who have
            // no site profile — only keep polling the ones the cache already holds.
            const cachedProfile = await repos.profile.cacheReadList({ sid });
            if (disposed) return;
            const cachedProfileUserIds = new Set(
                (cachedProfile?.list ?? []).map(profile => profile.userId ?? profile.uid).filter(Boolean)
            );
            const profileTargetIds = [...memberUserIds]
                .filter(userId => cachedProfileUserIds.has(userId))
                .map(userId => `${sid}@${userId}`);

            const sync = getSyncManager();

            // Register a join (read-state) plan per member as `channelId@userId` so every member's
            // read cursor stays live, not just my own. useJoinSync already registers my join with
            // the same composite id; register() refcounts by target key, so it dedups. No explicit
            // intervalMs — match useJoinSync's key so the dedup holds.
            const joinDisposers = [...memberUserIds].map(userId => sync.registerJoin(`${channelId}@${userId}`));

            const profileDisposers = profileTargetIds.map(profileId =>
                sync.register({ type: 'profile', id: profileId, intervalMs: 5000 })
            );

            disposers = [...joinDisposers, ...profileDisposers];
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
    }, [repos.user, repos.join, repos.profile, channelId, sid, isVerified, channel, chats, myUid]);

    // 읽음 커서 전진 — chats는 내림차순(최신이 head)이라 chats[0]이 최신.
    // 새 high-water chatNo일 때만 1회(과거 페이지 로드로는 latest 불변 → 미호출). DOM과 무관.
    useEffect(() => {
        if (chats.length === 0) return;
        const latestNo = chats[0]?.chatNo ?? 0;
        if (latestNo > lastReadSentRef.current) {
            lastReadSentRef.current = latestNo;
            void repos.join.readChat({ channelId, chatNo: latestNo }).catch(() => {
                // best-effort; 다음 메시지에서 다시 전진한다
            });
        }
    }, [chats, channelId, repos.join]);

    // 스크롤 보정은 새 chats가 DOM에 커밋된 뒤 동기적으로(useLayoutEffect, paint 전) 수행한다.
    // 캐시 re-emit이 디바운스라 await 직후엔 DOM이 아직 안 커져 있으므로, chats 변화에 반응해야 한다.
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el || chats.length === 0) return;

        // 1. 페이징: 과거 페이지가 위에 prepend되어도 보던 메시지 위치를 유지(맨위 점프 방지).
        //    재구독 도중 윈도우가 아직 안 커진(높이 동일) 중간 emit에서는 앵커를 소비하지 않고,
        //    실제로 DOM이 커진 emit에서만 복원한다(디바운스 re-emit 경쟁 대응).
        if (pagingAnchorRef.current != null) {
            if (el.scrollHeight > pagingAnchorRef.current) {
                el.scrollTop = el.scrollHeight - pagingAnchorRef.current;
                pagingAnchorRef.current = null;
            }
            return;
        }
        // 2. 최초 진입 또는 내가 보낸 직후 → 무조건 최하단.
        if (!hasInitialScrolledRef.current || forceBottomRef.current) {
            hasInitialScrolledRef.current = true;
            forceBottomRef.current = false;
            el.scrollTop = el.scrollHeight;
            return;
        }
        // 3. 하단 근처에서 새 메시지 도착 → 하단 추종(과거 읽는 중이면 끌어내리지 않음).
        if (wasNearBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [chats]);

    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore) return;
        const oldest = chats[chats.length - 1];
        if (!oldest) return;

        setIsLoadingMore(true);
        // Capture height BEFORE the older page renders; the layout effect restores the anchor
        // once chats grows (the cache re-emit is debounced, so we can't restore inline here).
        pagingAnchorRef.current = listRef.current?.scrollHeight ?? 0;

        try {
            const result = await repos.chat.refreshList({
                channelId,
                cursorNo: oldest.chatNo,
                limit: PAGE_SIZE,
            });
            if (result.fetchedCount === 0) {
                setHasMore(false);
                pagingAnchorRef.current = null; // no older rows → nothing to anchor
            } else {
                // Widen the observe window so the freshly-cached older page enters `chats`.
                setPageLimit(prev => prev + PAGE_SIZE);
            }
        } catch {
            pagingAnchorRef.current = null; // failed → drop the stale anchor
        } finally {
            setIsLoadingMore(false);
        }
    }, [repos.chat, channelId, chats, isLoadingMore, hasMore]);

    const handleScroll = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        // Track nearness so the layout effect only follows new messages when the user
        // is already at the bottom (not while scrolled up reading history).
        wasNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (el.scrollTop < 60) {
            void loadMore();
        }
    }, [loadMore]);

    const handleSend = async () => {
        if (!message.trim() || isSending) return;
        const text = message.trim();
        setMessage('');
        setIsSending(true);
        // 내가 보낸 메시지는 항상 따라가도록, 다음 chats 갱신에서 최하단으로 강제한다.
        forceBottomRef.current = true;
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
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{channel?.name ?? channelId}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{channelId}</p>
                </div>
                <button
                    onClick={() => setIsInviteOpen(true)}
                    className="shrink-0 px-3 py-1 text-xs rounded border border-primary text-primary hover:bg-primary/10"
                >
                    초대
                </button>
            </div>

            {isInviteOpen && <InviteCreateDialog channelId={channelId} onClose={() => setIsInviteOpen(false)} />}

            {/* 메시지 목록 */}
            <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                {isLoadingMore && <p className="text-center text-xs text-muted-foreground py-2">불러오는 중...</p>}
                {!hasMore && chats.length > 0 && (
                    <p className="text-center text-xs text-muted-foreground py-2">처음 메시지입니다</p>
                )}
                {chats.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">메시지가 없습니다</p>
                ) : (
                    [...chats]
                        .reverse()
                        .map(chat => (
                            <ChatBubble
                                key={chat.id}
                                chat={chat}
                                isMine={!!chat.ownerId && chat.ownerId === myUid}
                                user={userMap.get(chat.ownerId ?? '') ?? null}
                                profile={profileMap.get(chat.ownerId ?? '') ?? null}
                                unreadCount={countUnread(chat)}
                            />
                        ))
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

interface ChatBubbleProps {
    chat: DomainChat;
    isMine: boolean;
    user: DomainUser | null;
    profile: DomainProfile | null;
    unreadCount: number;
}

const Avatar = ({ thumbnail, label }: { thumbnail?: string; label: string }) => {
    if (thumbnail) {
        return <img src={thumbnail} alt={label} className="w-7 h-7 rounded-full object-cover shrink-0" />;
    }
    return (
        <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center shrink-0">
            {label.slice(0, 1).toUpperCase()}
        </div>
    );
};

const ChatBubble = ({ chat, isMine, user, profile, unreadCount }: ChatBubbleProps) => {
    const time = formatChatTime(chat.createdAtMs);
    // Identity: user name is the canonical name; profile (site-scoped) takes precedence for
    // nick + avatar when present. owner$ on the chat is a last-resort fallback.
    const userName = user?.name ?? chat.owner$?.name ?? chat.ownerId ?? '—';
    const nick = profile?.nick;
    const thumbnail = profile?.thumbnail ?? user?.thumbnail ?? chat.owner$?.thumbnail;

    return (
        <div className={`flex gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            <Avatar thumbnail={thumbnail} label={nick ?? userName} />
            <div className={`flex flex-col gap-0.5 max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
                {/* 디버깅용: 유저 이름 + 멤버 프로필 닉을 항상 함께 노출(프로필 없으면 표기). */}
                <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium">user:</span> {userName}
                    {' · '}
                    <span className="font-medium">profile:</span> {nick ?? '없음'}
                </p>
                <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                        chat.isPending
                            ? 'bg-muted text-muted-foreground'
                            : isMine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card border border-border'
                    }`}
                >
                    <p className="break-words">{chat.content}</p>
                </div>
                {/* 유저id · 메시지no · 시각 · 안읽음 수 */}
                <div className="flex gap-1.5 text-[10px] text-muted-foreground font-mono">
                    <span className="truncate max-w-[10rem]">{chat.ownerId ?? '—'}</span>
                    <span>#{chat.chatNo}</span>
                    {time && <span>{time}</span>}
                    {unreadCount > 0 && <span className="text-primary">안읽음 {unreadCount}</span>}
                    {chat.isPending && <span>전송중</span>}
                </div>
            </div>
        </div>
    );
};
