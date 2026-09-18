import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { runtime } from '@chatic/app-runtime';
import type { DataRepositories, DomainChannel, DomainChat, DomainJoin, DomainProfile, DomainUser } from '@chatic/data';
import { metricsCollector } from '../metrics/MetricsCollector';
import { useRenderCount } from '../metrics/useRuntimeMetrics';
import { InviteCreateDialog } from '../features/invite/InviteCreateDialog';
import { SystemSendPanel } from '../features/system-message/SystemSendPanel';
import { countUnreadMembers, formatSystemChatLabel, isSystemChat } from '../features/system-message/systemChat';

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
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;

    const identity = runtime.session.useSessionIdentity();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const myUid = identity.userId ?? '';
    const { isVerified } = runtime.connection.useRuntimeSocketState();

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
    const [isSystemSendOpen, setIsSystemSendOpen] = useState(false);

    const listRef = useRef<HTMLDivElement>(null);
    // Per-room scroll/read guards (reset on channel change):
    const hasInitialScrolledRef = useRef(false); // bottom-align once on first page
    const lastReadSentRef = useRef(0); // high-water chatNo already marked read
    const forceBottomRef = useRef(false); // force bottom after our own send
    const pagingAnchorRef = useRef<number | null>(null); // pre-paging scrollHeight to anchor to
    const wasNearBottomRef = useRef(true); // user is near the bottom (follow new messages)
    const usersSinceRef = useRef(0); // channel-users sync cursor (since); advances per sync

    if (!channelId) return null;

    useRenderCount('CreateChannel');

    // Register the chat messages (real-time append + initial prime) and channel meta as sync targets.
    // The initial load fetch is owned by the sync-registration layer, so the page never calls
    // refreshList itself.
    runtime.sync.useChatSync(channelId);
    runtime.sync.useChannelSync(channelId);

    // Subscribe to channel meta — register populates it via channel.get and keeps it fresh by polling.
    useEffect(() => {
        return repos.channel.observeItem(channelId, setChannel);
    }, [repos.channel, channelId]);

    // When the room changes, reset the scroll/read guards and paging state (treat it as a fresh entry).
    useEffect(() => {
        hasInitialScrolledRef.current = false;
        lastReadSentRef.current = 0;
        forceBottomRef.current = false;
        pagingAnchorRef.current = null;
        usersSinceRef.current = 0;
        setChats([]);
        setHasMore(true);
        setPageLimit(PAGE_SIZE);
    }, [channelId]);

    // Subscribe to the chat list — observeList only returns the newest `limit` rows (ChatQueryExecutor
    // paginates by chat_no cursor in reverse order), so seeing further into the past means widening
    // the window (limit). When pageLimit grows, it re-subscribes and re-reads, this time including
    // the older messages already cached.
    useEffect(() => {
        return repos.chat.observeList({ channelId, limit: pageLimit }, result => {
            const list = result?.list ?? [];
            setChats(list);
            metricsCollector.reportChat(channelId, list);
        });
    }, [repos.chat, channelId, pageLimit]);

    // Subscribe to the member user cache (name/avatar fallback) and the join cache (per-member
    // readNo for unread calculation).
    useEffect(() => {
        return repos.user.observeList({ channelId }, r => setUsers(r?.list ?? []));
    }, [repos.user, channelId]);

    // Network load of the channel user list (channel.sync-users → user + join cache). Manages a since
    // cursor for incremental sync; the $join embedded in the response is also cached, filling in the
    // per-member read state. The network call depends on the current session, so it only runs after
    // isVerified (auto-retries on re-authentication/re-entry).
    useEffect(() => {
        if (!isVerified) return;
        // The app-runtime/data dist types are stale so syncChannelUsers isn't visible yet (same
        // reason as the repos cast at the top of the file) — narrow-cast the user repo. The return
        // value is the next since (syncedAt).
        const userRepo = repos.user as unknown as {
            syncChannelUsers(payload: { channelId: string; since?: number }): Promise<number>;
        };
        void userRepo
            .syncChannelUsers({ channelId, since: usersSinceRef.current })
            .then(syncedAt => {
                usersSinceRef.current = syncedAt;
            })
            .catch(() => {
                // best-effort; the cache stream keeps working even if this fails
            });
    }, [repos.user, channelId, isVerified]);

    useEffect(() => {
        return repos.join.observeList({ channelId }, r => setJoins(r?.list ?? []));
    }, [repos.join, channelId]);

    // Subscribe to the site profile (nick/avatar, profile takes precedence). Profiles are sid-scoped,
    // so we only subscribe once the channel's sid is known.
    const sid = channel?.sid ?? selectedSiteId;
    useEffect(() => {
        if (!sid) {
            setProfiles([]);
            return;
        }
        return repos.profile.observeList({ sid }, r => setProfiles(r?.list ?? []));
    }, [repos.profile, sid]);

    // ownerId (uid) → user / profile lookup maps.
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
    const profileMap = useMemo(() => new Map(profiles.map(p => [p.userId ?? p.uid, p])), [profiles]);

    // All chat room members (participants) — the source of truth is channel.memberIds. My own uid
    // is always included.
    const memberIds = useMemo(() => {
        const set = new Set<string>(channel?.memberIds ?? []);
        if (myUid) set.add(myUid);
        return [...set];
    }, [channel?.memberIds, myUid]);

    // Per-member read cursor. The API stores the read position in join.chatNo ("last read chat
    // number") — only my own join additionally gets readNo filled in by readChat — and a member
    // with no join row is "joined but hasn't done anything yet", so their cursor is 0.
    const cursorByUser = useMemo(() => {
        const map = new Map<string, number>();
        for (const j of joins) {
            if (!j.userId) continue;
            map.set(j.userId, Math.max(j.readNo ?? 0, j.chatNo ?? 0));
        }
        return map;
    }, [joins]);

    // Per-message "unread member count": across all members (including cursor-0 members with no
    // join row), the count of people whose cursor is below that chatNo (excluding the sender).
    // System messages (join/leave) don't count toward unread, so the helper returns 0 for them.
    const countUnread = (chat: DomainChat): number => countUnreadMembers(chat, memberIds, cursorByUser);

    // Channel title rule (same as Home/Settings): self → my join nick (falls back to my profile
    // nick); dm → not yet handled; otherwise → channel.name if I'm the owner, else my join.nick
    // (falls back to channel.name) if I'm a member.
    const myJoinNick = useMemo(() => joins.find(j => j.userId === myUid)?.nick, [joins, myUid]);
    const channelTitle = useMemo(() => {
        if (!channel) return channelId;
        const fallback = channel.name || channelId;
        if (channel.stereo === 'self') return myJoinNick || profileMap.get(myUid)?.nick || fallback;
        if (channel.stereo === 'dm') return fallback; // dm not yet handled (planned for later)
        const isOwner = channel.ownerId === myUid;
        return (isOwner ? channel.name : myJoinNick || channel.name) || channelId;
    }, [channel, channelId, myUid, myJoinNick, profileMap]);

    // Register the join (read-state) sync plan — registers one target per `channelId@userId` across
    // all members (channel.memberIds) so every member's read cursor stays fresh. Unlike the profile
    // registration, this doesn't depend on sid, so it's split into its own effect (it used to be
    // gated on sid, so join registration silently never happened without one). registerJoin refcounts
    // by key, so this dedupes against useJoinSync's registration of my own join.
    const memberKey = memberIds.join(',');
    useEffect(() => {
        if (!isVerified) return;
        const sync = runtime.sync.getSyncManager();
        const disposers = memberIds.map(userId => sync.registerJoin(`${channelId}@${userId}`));
        return () => disposers.forEach(dispose => dispose());
        // memberKey stands in for the member set (memberIds is only read once per key).
    }, [channelId, isVerified, memberKey]);

    useEffect(() => {
        if (!isVerified || !sid) return;
        let disposed = false;
        let disposers: Array<() => void> = [];

        void (async () => {
            // Loading channel users/joins is owned by the dedicated syncChannelUsers effect above.
            // Here we only read what's already in the cache to narrow down the profile registration
            // targets (best-effort).
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

            const sync = runtime.sync.getSyncManager();

            // join (read-state) registration is owned by the dedicated effect above (keyed on
            // memberIds, independent of sid). Here we only register profile sync.
            disposers = profileTargetIds.map(profileId =>
                sync.register({ type: 'profile', id: profileId, intervalMs: 5000 })
            );
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
    }, [repos.user, repos.join, repos.profile, channelId, sid, isVerified, channel, chats, myUid]);

    // Advance the read cursor — chats is descending (newest first), so chats[0] is the latest.
    // Fires once only when there's a new high-water chatNo (loading an older page never changes
    // latest, so it never fires here). Independent of the DOM.
    useEffect(() => {
        if (chats.length === 0) return;
        const latestNo = chats[0]?.chatNo ?? 0;
        if (latestNo > lastReadSentRef.current) {
            lastReadSentRef.current = latestNo;
            void repos.join.readChat({ channelId, chatNo: latestNo }).catch(() => {
                // best-effort; it advances again on the next message
            });
        }
    }, [chats, channelId, repos.join]);

    // Scroll correction runs synchronously after the new chats commit to the DOM (useLayoutEffect,
    // before paint). The cache re-emit is debounced, so the DOM hasn't grown yet right after an
    // await — we have to react to the chats change instead.
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el || chats.length === 0) return;

        // 1. Paging: when an older page is prepended above, keep the message the user was viewing
        //    in place (avoid a jump to the top). During re-subscription, an intermediate emit where
        //    the window hasn't actually grown yet (same height) doesn't consume the anchor — only an
        //    emit where the DOM has actually grown restores it (guards against the debounced
        //    re-emit race).
        if (pagingAnchorRef.current != null) {
            if (el.scrollHeight > pagingAnchorRef.current) {
                el.scrollTop = el.scrollHeight - pagingAnchorRef.current;
                pagingAnchorRef.current = null;
            }
            return;
        }
        // 2. First entry, or right after I send → always jump to the bottom.
        if (!hasInitialScrolledRef.current || forceBottomRef.current) {
            hasInitialScrolledRef.current = true;
            forceBottomRef.current = false;
            el.scrollTop = el.scrollHeight;
            return;
        }
        // 3. A new message arrives while near the bottom → follow it down (don't pull the view
        //    down while reading history).
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
        // So my own sent message is always followed, force the next chats update to the bottom.
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
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
                <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
                    ←
                </button>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{channelTitle}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{channelId}</p>
                </div>
                <button
                    onClick={() => setIsSystemSendOpen(true)}
                    className="shrink-0 px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
                >
                    시스템
                </button>
                <button
                    onClick={() => setIsInviteOpen(true)}
                    className="shrink-0 px-3 py-1 text-xs rounded border border-primary text-primary hover:bg-primary/10"
                >
                    초대
                </button>
            </div>

            {isInviteOpen && <InviteCreateDialog channelId={channelId} onClose={() => setIsInviteOpen(false)} />}
            {isSystemSendOpen && <SystemSendPanel channelId={channelId} onClose={() => setIsSystemSendOpen(false)} />}

            {/* Message list */}
            <div
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 space-y-2"
            >
                {isLoadingMore && <p className="text-center text-xs text-muted-foreground py-2">불러오는 중...</p>}
                {!hasMore && chats.length > 0 && (
                    <p className="text-center text-xs text-muted-foreground py-2">처음 메시지입니다</p>
                )}
                {chats.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">메시지가 없습니다</p>
                ) : (
                    [...chats].reverse().map(chat =>
                        // System messages (join/leave) render as a centered pill, not a chat bubble.
                        isSystemChat(chat) ? (
                            <SystemChatBubble
                                key={chat.id}
                                chat={chat}
                                user={userMap.get(chat.ownerId ?? '') ?? null}
                                profile={profileMap.get(chat.ownerId ?? '') ?? null}
                            />
                        ) : (
                            <ChatBubble
                                key={chat.id}
                                chat={chat}
                                isMine={!!chat.ownerId && chat.ownerId === myUid}
                                user={userMap.get(chat.ownerId ?? '') ?? null}
                                profile={profileMap.get(chat.ownerId ?? '') ?? null}
                                unreadCount={countUnread(chat)}
                            />
                        )
                    )
                )}
            </div>

            {/* Input area */}
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

interface SystemChatBubbleProps {
    chat: DomainChat;
    user: DomainUser | null;
    profile: DomainProfile | null;
}

// Renders a join/leave system message. The server stores no text, so we derive the label from
// `subType` + the subject's name. The raw subType code is shown for debugging in the testbed.
const SystemChatBubble = ({ chat, user, profile }: SystemChatBubbleProps) => {
    const name = profile?.nick ?? user?.name ?? chat.owner$?.name ?? chat.ownerId ?? '—';
    const label = formatSystemChatLabel(chat.subType, name);
    const time = formatChatTime(chat.createdAtMs);
    return (
        <div className="flex justify-center py-1">
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                {label}
                <span className="ml-1.5 font-mono text-[10px] opacity-60">[{chat.subType || 'system'}]</span>
                {time && <span className="ml-1.5 font-mono text-[10px] opacity-60">{time}</span>}
            </span>
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
            <div
                className={`flex min-w-0 flex-col gap-0.5 max-w-[min(75%,32rem)] ${isMine ? 'items-end' : 'items-start'}`}
            >
                {/* Debug: always show the user name alongside the member profile nick (shows "none" when there's no profile). */}
                <p className="text-[10px] text-muted-foreground break-all">
                    <span className="font-medium">user:</span> {userName}
                    {' · '}
                    <span className="font-medium">profile:</span> {nick ?? '없음'}
                </p>
                <div
                    className={`min-w-0 max-w-full rounded-2xl px-3 py-2 text-sm ${
                        chat.isPending
                            ? 'bg-muted text-muted-foreground'
                            : isMine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card border border-border'
                    }`}
                >
                    <p className="whitespace-pre-wrap break-words">{chat.content}</p>
                </div>
                {/* User id · message # · time · unread count */}
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
