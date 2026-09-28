import { useEffect, useRef, useState } from 'react';
import { runtime } from '@chatic/app-runtime';
import type { DataRepositories, DomainCloud, DomainProfile, DomainUser } from '@chatic/data';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import { DBBrowser } from './DBBrowser';
import { useRuntimeMetrics } from '../metrics/useRuntimeMetrics';
import { useUpdateUserProfile } from '../features/user-profile/useUpdateUserProfile';
import { useActiveCloudChannels } from '../features/unread/useActiveCloudChannels';
import { useHomeUnreads } from '../features/unread/useHomeUnreads';
import { useUpdateCloud } from '../features/cloud/useUpdateCloud';
import { normalizeName } from '../features/naming';

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
    const session = runtime.session.useGlobalSession();
    const { isAuthenticated, isInitialized } = runtime.session.useSessionAuth();
    const socketState = runtime.connection.useRuntimeSocketState();
    const [tab, setTab] = useState<'Status' | 'DB' | 'Perf' | 'Profile' | 'Unread'>('Status');

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
    // Profile facts (guest/role/type/name) now track the cached profile, not the session payload.
    const facts = runtime.session.useRuntimeProfile();

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
                <span className="font-semibold text-sm">Runtime Status</span>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">
                    ✕
                </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3">
                <div className="flex gap-1 mb-3">
                    {(['Status', 'DB', 'Perf', 'Profile', 'Unread'] as const).map(t => (
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
                {tab === 'Profile' && <ProfileTab />}
                {tab === 'Unread' && <UnreadTab />}
                {tab === 'Perf' && <PerfTab socketStateLabel={socketState.state} />}
                {tab === 'Status' && (
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
                            <Row label="isVerified" value={String(socketState.isVerified)} />
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
};

// Profile tab: cloud name + account-wide user profile (active-server scoped) + the site profile.
const ProfileTab = () => (
    <div className="space-y-4">
        <CloudNameSection />
        <UserProfileSection />
        <SiteProfileSection />
    </div>
);

// Renames the active cloud through repos.cloud.updateCloud and observes the cloud cache so the
// displayed name tracks the change reactively (cacheWrite re-emits to observeItem subscribers).
const CloudNameSection = () => {
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;
    const { activeServer } = runtime.session.useGlobalSession();
    const updateCloud = useUpdateCloud();
    const cloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : '';

    const [current, setCurrent] = useState<DomainCloud | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const prefilledRef = useRef(false);

    // Observe the cloud so the form reflects synced/optimistic name changes from the cache stream.
    useEffect(() => {
        if (!cloudId) {
            setCurrent(null);
            return;
        }
        return repos.cloud.observeItem(cloudId, setCurrent);
    }, [repos.cloud, cloudId]);

    useEffect(() => {
        prefilledRef.current = false;
    }, [cloudId]);
    useEffect(() => {
        if (current && !prefilledRef.current) {
            prefilledRef.current = true;
            setName(current.name ?? '');
        }
    }, [current]);

    const handleSave = async () => {
        const normalized = normalizeName(name, 2);
        if (!normalized) {
            setError('Cloud name must be at least 2 characters.');
            return;
        }
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            await updateCloud(cloudId, normalized);
            setSaved(true);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!cloudId) {
        return (
            <Section title="Cloud name">
                <p className="text-xs text-muted-foreground">
                    You can only rename a cloud while a cloud server is active.
                </p>
            </Section>
        );
    }

    return (
        <div className="space-y-2">
            <Section title="Cloud name">
                <Row label="cloudId" value={cloudId} />
                <Row label="current name" value={current?.name ?? '—'} />
            </Section>
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">name</label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Cloud name"
                    className="border border-border bg-background rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
                {saved && <span className="text-xs text-muted-foreground">Saved ✓</span>}
            </div>
        </div>
    );
};

// Edits the account-wide user profile (name/photo) through repos.user.updateProfile, then
// re-issues the active server session. The displayed name is observed from the user cache (not the
// static session identity) so it tracks the change reactively; getMyProfile hydrates the cache.
const UserProfileSection = () => {
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;
    const identity = runtime.session.useSessionIdentity();
    const updateUserProfile = useUpdateUserProfile();
    const uid = identity.userId ?? '';

    const [current, setCurrent] = useState<DomainUser | null>(null);
    const [name, setName] = useState('');
    const [photo, setPhoto] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const prefilledRef = useRef(false);

    // Observe the user cache so the current name updates live after a save (cacheWrite re-emits).
    useEffect(() => {
        if (!uid) {
            setCurrent(null);
            return;
        }
        // Hydrate the cache once so the observer has a row even before the first edit.
        void repos.user.getMyProfile().catch(() => undefined);
        return repos.user.observeItem(uid, setCurrent);
    }, [repos.user, uid]);

    // Prefill once from the observed user (fall back to the session identity name).
    useEffect(() => {
        prefilledRef.current = false;
    }, [uid]);
    useEffect(() => {
        if (!prefilledRef.current && current?.name) {
            prefilledRef.current = true;
            setName(current.name);
        }
    }, [current]);

    const handleSave = async () => {
        const normalized = normalizeName(name);
        if (!normalized) {
            setError('Please enter a name.');
            return;
        }
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            await updateUserProfile({
                name: normalized,
                ...(photo.trim() ? { photo: photo.trim() } : {}),
            });
            setSaved(true);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!identity.userId) {
        return <p className="text-xs text-muted-foreground">Log in to change the user profile.</p>;
    }

    return (
        <div className="space-y-2">
            <Section title="User profile (active server)">
                <Row label="userId" value={identity.userId} />
                <Row label="current name" value={current?.name ?? '—'} />
            </Section>
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">name</label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="User name"
                    className="border border-border bg-background rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">photo (URL or base64)</label>
                <input
                    value={photo}
                    onChange={e => setPhoto(e.target.value)}
                    placeholder="https://... or data:image/..."
                    className="border border-border bg-background rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
                {saved && <span className="text-xs text-muted-foreground">Saved ✓</span>}
            </div>
        </div>
    );
};

// Edits the current user's site profile (nick/thumbnail) for the active place. Writes via
// repos.profile.setMyProfile (optimistic cache + profile.set); the site is named by this component
// (ADR-0085) and is the same `sid` the profile id below is built from.
const SiteProfileSection = () => {
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;
    const { activeServer } = runtime.session.useGlobalSession();
    const identity = runtime.session.useSessionIdentity();
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
            await repos.profile.setMyProfile(
                {
                    nick: nick.trim(),
                    ...(thumbnail.trim() ? { thumbnail: thumbnail.trim() } : {}),
                },
                sid
            );
            setSaved(true);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!sid || !uid) {
        return (
            <p className="text-xs text-muted-foreground">Select a site (place) first before setting your profile.</p>
        );
    }

    return (
        <div className="space-y-3">
            <Section title="My profile">
                <Row label="profileId" value={profileId} />
                <Row label="current nick" value={current?.nick ?? '—'} />
            </Section>

            <div className="space-y-2">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">nick</label>
                    <input
                        value={nick}
                        onChange={e => setNick(e.target.value)}
                        placeholder="Display name"
                        className="border border-border bg-background rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">thumbnail (URL or base64)</label>
                    <input
                        value={thumbnail}
                        onChange={e => setThumbnail(e.target.value)}
                        placeholder="https://... or data:image/..."
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
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                    {saved && <span className="text-xs text-muted-foreground">Saved ✓</span>}
                </div>
            </div>
        </div>
    );
};

// Shows the unread counts derived from each channel's synced $join/lastChat/metaNo: cloud total,
// per-site sums, and per-channel counts. Freshness comes from the home page's periodic
// syncChannels delta, not per-channel registration.
const UnreadTab = () => {
    const channels = useActiveCloudChannels();
    const { aggregates } = useHomeUnreads(channels);
    const { byChannel, byPlace, total } = aggregates;

    const channelById = new Map(channels.map(ch => [ch.id, ch]));

    return (
        <div className="space-y-3">
            <Section title="Total">
                <Row label="cloud unread total" value={total} />
                <Row label="subscribed channels" value={channels.length} />
            </Section>

            <Section title="By site">
                {Object.keys(byPlace).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No site has any unread</p>
                ) : (
                    Object.entries(byPlace).map(([sid, count]) => <Row key={sid} label={sid} value={count} />)
                )}
            </Section>

            <Section title="By channel">
                {channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No subscribed channels</p>
                ) : (
                    Object.entries(byChannel).map(([id, count]) => (
                        <Row key={id} label={channelById.get(id)?.name || id} value={count} />
                    ))
                )}
            </Section>
        </div>
    );
};

// All values are computed web-side by the MetricsCollector; this tab only renders
// the snapshot plus a 1s poll of the live sync target registry.
const PerfTab = ({ socketStateLabel }: { socketStateLabel: string }) => {
    const metrics = useRuntimeMetrics();
    const [targets, setTargets] = useState<Array<SyncTargetDescriptor & { cid: string }>>([]);

    useEffect(() => {
        const poll = () => setTargets(runtime.sync.getSyncManager().listTargets());
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
                    <p className="text-xs text-muted-foreground">No sync targets registered</p>
                ) : (
                    targets.map(t => (
                        <Row key={`${t.cid}|${t.type}:${t.id ?? ''}`} label={t.type} value={t.id ?? '(current)'} />
                    ))
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
                    <p className="text-xs text-muted-foreground">No observed changes</p>
                ) : (
                    Object.entries(metrics.cacheObservations).map(([domain, count]) => (
                        <Row key={domain} label={domain} value={count} />
                    ))
                )}
            </Section>

            <Section title="Renders">
                {Object.keys(metrics.renders).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No render reports</p>
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
