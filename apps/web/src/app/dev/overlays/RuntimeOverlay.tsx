import { useEffect, useRef, useState } from 'react';
import { useGlobalSession, useSessionAuth, useSessionIdentity } from '@chatic/web-core';
import { useSocketState, getSyncManager, useRuntimeRepositories, useSessionProfile } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainProfile } from '@chatic/data';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import { DBBrowser } from './DBBrowser';
import { useRuntimeMetrics } from '../metrics/useRuntimeMetrics';
import { useActiveCloudChannels, useChannelUnreads } from '../../features/home/hooks';
import { readCloudUnreadSnapshot, sumSnapshot } from '../../features/home/lib';

interface Props {
    onClose: () => void;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex gap-2 text-xs">
        <span className="text-muted-foreground w-28 shrink-0">{label}</span>
        <span className="font-mono break-all">{value ?? '—'}</span>
    </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{title}</p>
        {children}
    </div>
);

export const RuntimeOverlay = ({ onClose }: Props) => {
    const session = useGlobalSession();
    const { isAuthenticated, isInitialized } = useSessionAuth();
    const socketState = useSocketState();
    const [tab, setTab] = useState<'상태' | 'DB' | '성능' | '프로필' | '안읽음'>('상태');

    // Floating draggable panel: start near the top-right so it doesn't cover the header.
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState(() => ({
        x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 400) - 380 - 16),
        y: 72,
    }));
    const dragRef = useRef<{ dx: number; dy: number } | null>(null);

    const clampToViewport = (x: number, y: number) => {
        const el = panelRef.current;
        const w = el?.offsetWidth ?? 360;
        const h = el?.offsetHeight ?? 400;
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
    };

    const onHandlePointerDown = (e: React.PointerEvent) => {
        const el = panelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onHandlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        setPos(clampToViewport(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
    };
    const onHandlePointerUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    };

    const { relay, cloud, identity, activeServer } = session;
    const facts = useSessionProfile();

    return (
        <div
            ref={panelRef}
            style={{ left: pos.x, top: pos.y }}
            className="fixed z-50 w-[min(92vw,32rem)] max-h-[80dvh] flex flex-col overflow-hidden rounded-2xl bg-card border border-border shadow-xl"
        >
            {/* Drag handle. The panel is the only element on screen capturing pointer events
                (no full-screen backdrop), so the rest of the app stays interactive while open. */}
            <div
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                className="flex items-center justify-between px-4 py-3 border-b border-border cursor-move select-none touch-none"
            >
                <span className="font-semibold text-sm">Runtime 상태</span>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">
                    ✕
                </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
                <div className="flex gap-1 mb-3">
                    {(['상태', 'DB', '성능', '프로필', '안읽음'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1 text-xs rounded ${
                                tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {tab === 'DB' && <DBBrowser />}
                {tab === '프로필' && <ProfileTab />}
                {tab === '성능' && <PerfTab socketStateLabel={socketState.state} />}
                {tab === '안읽음' && <UnreadTab />}
                {tab === '상태' && (
                    <>
                        <Section title="Session">
                            <Row label="initialized" value={String(isInitialized)} />
                            <Row label="authenticated" value={String(isAuthenticated)} />
                            <Row label="isGuest" value={String(facts.isGuest)} />
                            <Row label="userId" value={identity.userId} />
                            <Row label="delegatorId" value={identity.delegatorId} />
                            <Row label="userName" value={facts.userName} />
                            <Row label="userRole" value={facts.userRole} />
                            <Row label="error" value={identity.error?.message ?? null} />
                        </Section>

                        <Section title="Active Server">
                            <Row label="kind" value={activeServer.kind} />
                            <Row label="siteId" value={activeServer.siteId} />
                            <Row label="backend" value={activeServer.backend} />
                            <Row label="wss" value={activeServer.wss} />
                            <Row label="identityToken" value={activeServer.identityToken} />
                            {'cloudId' in activeServer && <Row label="cloudId" value={activeServer.cloudId} />}
                        </Section>

                        <Section title="Relay">
                            <Row label="isAuthenticated" value={String(relay.isAuthenticated)} />
                            <Row label="siteId" value={relay.siteId} />
                            <Row label="backend" value={relay.backend} />
                            <Row label="wss" value={relay.wss} />
                            <Row label="identityToken" value={relay.identityToken} />
                        </Section>

                        <Section title="Cloud">
                            <Row label="isActive" value={String(cloud.isActive)} />
                            <Row label="cloudId" value={cloud.cloudId} />
                            <Row label="siteId" value={cloud.siteId} />
                            <Row label="backend" value={cloud.backend} />
                            <Row label="wss" value={cloud.wss} />
                            <Row label="identityToken" value={cloud.identityToken} />
                        </Section>

                        <Section title="Socket">
                            <Row label="state" value={socketState.state} />
                            <Row label="isConnected" value={String(socketState.isConnected)} />
                            <Row label="isVerified" value={String(socketState.isVerified)} />
                            <Row label="connectionId" value={socketState.connectionId} />
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
};

// Edits the current user's site profile (nick/thumbnail) for the active place. Writes via
// repos.profile.setMyProfile (optimistic cache + profile.set), which uses the live sid/uid.
const ProfileTab = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const { activeServer } = useGlobalSession();
    const identity = useSessionIdentity();
    const sid = activeServer.siteId ?? '';
    const uid = identity.userId ?? '';
    const profileId = sid && uid ? `${sid}@${uid}` : '';

    const [current, setCurrent] = useState<DomainProfile | null>(null);
    const [nick, setNick] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const prefilledRef = useRef(false);

    // Observe the current profile so the form reflects synced changes.
    useEffect(() => {
        if (!profileId) {
            setCurrent(null);
            return;
        }
        return repos.profile.observeItem(profileId, setCurrent);
    }, [repos.profile, profileId]);

    // Prefill inputs once per profile (don't clobber in-progress edits on later emits).
    useEffect(() => {
        prefilledRef.current = false;
    }, [profileId]);
    useEffect(() => {
        if (current && !prefilledRef.current) {
            prefilledRef.current = true;
            setNick(current.nick ?? '');
            setThumbnail(current.thumbnail ?? '');
        }
    }, [current]);

    const handleSave = async () => {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            await repos.profile.setMyProfile({
                nick: nick.trim(),
                ...(thumbnail.trim() ? { thumbnail: thumbnail.trim() } : {}),
            });
            setSaved(true);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!sid || !uid) {
        return (
            <p className="text-xs text-muted-foreground">
                사이트(플레이스)를 먼저 선택해야 내 프로필을 설정할 수 있습니다.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <Section title="내 프로필">
                <Row label="profileId" value={profileId} />
                <Row label="현재 nick" value={current?.nick ?? '—'} />
            </Section>

            <div className="space-y-2">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">nick</label>
                    <input
                        value={nick}
                        onChange={e => setNick(e.target.value)}
                        placeholder="표시 이름"
                        className="border border-border bg-background rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">thumbnail (URL 또는 base64)</label>
                    <input
                        value={thumbnail}
                        onChange={e => setThumbnail(e.target.value)}
                        placeholder="https://... 또는 data:image/..."
                        className="border border-border bg-background rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                {thumbnail.trim() && (
                    <img
                        src={thumbnail}
                        alt="preview"
                        className="w-12 h-12 rounded-full object-cover border border-border"
                    />
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                    >
                        {saving ? '저장 중...' : '저장'}
                    </button>
                    {saved && <span className="text-xs text-muted-foreground">저장됨 ✓</span>}
                </div>
            </div>
        </div>
    );
};

// Unread inspector: observes the active cloud's full channel list and shows the same aggregates the
// home surface / app badge use — cloud total, per-site sums, and the per-channel unread list — plus
// the persisted per-cloud snapshot that feeds inactive-cloud dots and the badge sum. Read-only.
const UnreadTab = () => {
    const channels = useActiveCloudChannels();
    const { byChannel, byPlace, total } = useChannelUnreads(channels);
    const nameById = new Map(channels.map(ch => [ch.id, ch.name ?? ch.id]));
    const snapshot = readCloudUnreadSnapshot();

    // "안읽음 목록" — only entries with unread > 0.
    const unreadPlaces = Object.entries(byPlace).filter(([, count]) => count > 0);
    const unreadChannels = Object.entries(byChannel).filter(([, count]) => count > 0);
    const snapshotClouds = Object.entries(snapshot).filter(([, count]) => count > 0);

    return (
        <div className="space-y-3">
            <Section title="전체">
                <Row label="활성 클라우드 안읽음 합계" value={total} />
                <Row label="관측 채널 수" value={channels.length} />
                <Row label="앱 뱃지 (방문 클라우드 합)" value={sumSnapshot(snapshot)} />
            </Section>

            <Section title={`사이트별 안읽음 (${unreadPlaces.length})`}>
                {unreadPlaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽음이 있는 사이트가 없습니다</p>
                ) : (
                    unreadPlaces.map(([sid, count]) => <Row key={sid} label={sid} value={count} />)
                )}
            </Section>

            <Section title={`채널별 안읽음 (${unreadChannels.length})`}>
                {unreadChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽은 채널이 없습니다</p>
                ) : (
                    unreadChannels.map(([id, count]) => <Row key={id} label={nameById.get(id) || id} value={count} />)
                )}
            </Section>

            <Section title="클라우드 스냅샷">
                {snapshotClouds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">기록된 클라우드가 없습니다</p>
                ) : (
                    snapshotClouds.map(([cid, count]) => <Row key={cid} label={cid} value={count} />)
                )}
            </Section>
        </div>
    );
};

// All values are computed web-side by the MetricsCollector; this tab only renders
// the snapshot plus a 1s poll of the live sync target registry.
const PerfTab = ({ socketStateLabel }: { socketStateLabel: string }) => {
    const metrics = useRuntimeMetrics();
    const [targets, setTargets] = useState<SyncTargetDescriptor[]>([]);

    useEffect(() => {
        const poll = () => setTargets(getSyncManager().listTargets());
        poll();
        const id = setInterval(poll, 1000);
        return () => clearInterval(id);
    }, []);

    const sinceSec =
        metrics.socketStateSinceMs != null ? Math.round((Date.now() - metrics.socketStateSinceMs) / 1000) : null;

    return (
        <>
            <Section title={`Sync Targets (${targets.length})`}>
                {targets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">등록된 sync 타깃이 없습니다</p>
                ) : (
                    targets.map(t => <Row key={`${t.type}:${t.id ?? ''}`} label={t.type} value={t.id ?? '(current)'} />)
                )}
            </Section>

            <Section title="Throughput / Latency">
                <Row label="chat msgs total" value={metrics.chatMessagesTotal} />
                <Row label="chat msgs/s (10s)" value={metrics.chatMessagesPerSec} />
                <Row
                    label="last latency"
                    value={metrics.lastChatLatencyMs != null ? `${metrics.lastChatLatencyMs} ms` : null}
                />
                <Row
                    label="avg latency"
                    value={metrics.avgChatLatencyMs != null ? `${metrics.avgChatLatencyMs} ms` : null}
                />
            </Section>

            <Section title="Cache observations">
                {Object.keys(metrics.cacheObservations).length === 0 ? (
                    <p className="text-xs text-muted-foreground">관측된 변화가 없습니다</p>
                ) : (
                    Object.entries(metrics.cacheObservations).map(([domain, count]) => (
                        <Row key={domain} label={domain} value={count} />
                    ))
                )}
            </Section>

            <Section title="Renders">
                {Object.keys(metrics.renders).length === 0 ? (
                    <p className="text-xs text-muted-foreground">렌더 보고가 없습니다</p>
                ) : (
                    Object.entries(metrics.renders).map(([label, count]) => (
                        <Row key={label} label={label} value={count} />
                    ))
                )}
            </Section>

            <Section title="Connection quality">
                <Row label="state" value={socketStateLabel} />
                <Row label="connects" value={metrics.socketConnects} />
                <Row label="disconnects" value={metrics.socketDisconnects} />
                <Row label="in state for" value={sinceSec != null ? `${sinceSec}s` : null} />
            </Section>
        </>
    );
};
