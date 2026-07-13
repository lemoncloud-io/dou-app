import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useCloudSessionCatalog,
    useGlobalSession,
    useLogoutCloudSession,
    useSessionSelection,
    useSiteSwitch,
    useSwitchCloudSession,
} from '@chatic/web-core';
import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainChannel, DomainCloud, DomainPlace } from '@chatic/data';
import { metricsCollector } from '../metrics/MetricsCollector';
import { useRenderCount } from '../metrics/useRuntimeMetrics';
import { NameFormDialog } from '../features/manage/NameFormDialog';
import {
    buildChannelCreate,
    buildChannelUpdate,
    buildPlaceCreate,
    buildPlaceUpdate,
} from '../features/manage/payloads';
import { useActiveCloudChannels } from '../features/unread/useActiveCloudChannels';
import { useHomeUnreads } from '../features/unread/useHomeUnreads';
import { readCloudUnreadSnapshot, writeCloudUnread } from '../features/unread/cloudUnreadSnapshot';
import { useLastChat } from './useLastChat';

const DEFAULT_CLOUD_ID = 'default';

// Which name create/edit dialog is open. A single discriminated state keeps only one modal at a
// time and carries the target id/name for the edit flows.
type ManageDialog =
    | { kind: 'createPlace' }
    | { kind: 'editPlace'; id: string; name: string }
    | { kind: 'createChannel' }
    | { kind: 'editChannel'; id: string; name: string }
    | null;

// Interval for the periodic list refresh (site/profile/channel). Tunable — individual items
// poll faster via their own sync targets; this only re-discovers added/removed list entries.
const LIST_REFRESH_POLL_MS = 30_000;

// A chat's createdAt is a raw epoch (ms); render a short HH:MM, tolerating missing/odd values.
const formatChatTime = (createdAt?: number): string => {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' });
};

export const ChatHomePage = () => {
    const navigate = useNavigate();
    const session = useGlobalSession();
    const { selectedSiteId } = useSessionSelection();
    const { clouds } = useCloudSessionCatalog();
    const { switchCloud, isPending: isSwitching } = useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { switchSite, isSwitching: isSiteSwitching } = useSiteSwitch();

    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    // isVerified gates the list-discovery network calls: place/channel lists come from
    // socket gateways (UserGateway.mySite / channel list), so a fetch before the new
    // session is verified would run against the stale (pre-switch) session.
    const { isVerified } = useRuntimeSocketState();
    const cid: string = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';

    // The active site is the session's selected site. switchSite() pre-applies it
    // optimistically, so this flips immediately on click and the channel stream swaps.
    const activeSiteId = selectedSiteId;

    const [sites, setSites] = useState<DomainPlace[]>([]);
    const [channels, setChannels] = useState<DomainChannel[]>([]);
    // Invited clouds live in the cloud cache (cloudType 'invited'); they are NOT in the
    // relay catalog (useCloudSessionCatalog = owned clouds), so render them straight from cache.
    const [invitedClouds, setInvitedClouds] = useState<DomainCloud[]>([]);
    const [manageDialog, setManageDialog] = useState<ManageDialog>(null);

    // Unread aggregation over the active cloud's FULL channel list (every site), the source for the
    // per-channel numbers, per-place dots, and the cloud total. This is a cache observe only — no
    // per-channel realtime registration — so it doesn't add sync cost per channel; freshness rides
    // the periodic syncChannels delta below.
    const cloudChannels = useActiveCloudChannels();
    const { aggregates: unreads } = useHomeUnreads(cloudChannels);

    // Per-cloud presence for the cloud dots. The active cloud shows its live total; other clouds
    // can't be observed here (different cid scope), so they fall back to the last-visited snapshot.
    const [cloudUnread, setCloudUnread] = useState(() => readCloudUnreadSnapshot());
    useEffect(() => {
        setCloudUnread(writeCloudUnread(cid, unreads.total));
    }, [cid, unreads.total]);

    const siteIds = sites.map(site => site.id);
    const siteIdsKey = siteIds.join(',');
    // Only channels that truly belong to the active site may be sync-registered. During a
    // switch, `channels` can briefly still hold the previous site's rows (the observe callback
    // is async); registering those triggers sync pushes whose views lack api.sid, so
    // onUpdate→toDomainChannel re-tags them with the already-switched context.sid — that is what
    // corrupts the new site's list (prev site's channels reappear under the new sid). Scoping the
    // registration to sid===activeSiteId prevents the mis-tag at its source.
    const activeChannelIds = channels.filter(channel => channel.sid === activeSiteId).map(channel => channel.id);
    const activeChannelIdsKey = activeChannelIds.join(',');

    useRenderCount('ChatHome');

    // invite cloud 목록 구독 — 캐시에 저장된 초대 클라우드를 그대로 표시한다.
    useEffect(() => {
        return repos.cloud.observeList(result => {
            setInvitedClouds(result?.list ?? []);
            metricsCollector.reportObservation('cloud');
        });
    }, [repos.cloud]);

    // place 목록 구독 — activeServer(cid)가 바뀌면 재구독 + 기존 결과 폐기.
    useEffect(() => {
        setSites([]);
        return repos.place.observeList(undefined, result => {
            setSites(result?.list ?? []);
            metricsCollector.reportObservation('place');
        });
    }, [repos.place, cid]);

    // 사이트(place)/프로필/채널 목록 네트워크 리프레시 묶음 — 캐시를 채우는 fetch들.
    // place.refreshList는 전체 스냅샷(mySite + stale 정리)이라 워터마크가 없다.
    // channel.syncChannels / profile.syncProfiles는 델타(since 이후 변경분) API라, sync 메타에 저장된
    // syncedAt을 since로 넘기고 결과 syncedAt을 다시 저장해야 증분 스냅샷이 어긋나지 않는다.
    const refreshActiveLists = useCallback(async () => {
        void repos.place.refreshList().catch(() => {
            /* empty */
        });

        // 채널 델타 동기화 — channel.sync는 장소 횡단(클라우드 전체)이라 커서는 cid 단위다.
        // 각 채널은 자기 sid로 태깅되어 저장되므로 활성 사이트 전환과 무관하게 정확하다.
        try {
            const channelSyncKind = `channel-sync:${cid}`;
            const since = await repos.syncMeta.getSyncedAt(channelSyncKind);
            const { syncedAt } = await repos.channel.syncChannels(since);
            await repos.syncMeta.setSyncedAt(channelSyncKind, syncedAt);
        } catch {
            // best-effort: 실패 시 워터마크 미전진 → 다음 틱에 같은 since로 재시도
        }

        if (!activeSiteId) return;

        // 프로필 델타 동기화 — 커서를 {cid, sid}로 키잉한다(desktop-web useSiteProfileSync와 동일).
        // since=0을 매번 주면 전량 재pull이라 removal 증분이 추적되지 않으므로 워터마크를 전진시킨다.
        try {
            const profileSyncKind = `profile-sync:${cid}:${activeSiteId}`;
            const since = await repos.syncMeta.getSyncedAt(profileSyncKind);
            const { syncedAt } = await repos.profile.syncProfiles(since);
            await repos.syncMeta.setSyncedAt(profileSyncKind, syncedAt);
        } catch {
            // best-effort: 실패 시 워터마크를 전진시키지 않아 다음 틱에 같은 since로 재시도된다
        }
    }, [repos.place, repos.channel, repos.profile, repos.syncMeta, cid, activeSiteId]);

    // 타이밍 1·2 — 앱 진입 + 사이트/클라우드 전환 "확정 완료"(= 새 세션 재인증 → verified false→true).
    // 상승 엣지에서만 부르므로 전환 낙관 구간(아직 옛 세션이 verified=true)엔 fetch하지 않는다 —
    // 그래야 이전 사이트/클라우드 데이터가 새 sid/cid 스코프로 mis-tag/오염되지 않는다.
    const prevVerifiedRef = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerifiedRef.current && isVerified;
        prevVerifiedRef.current = isVerified;
        if (becameVerified) void refreshActiveLists();
    }, [isVerified, refreshActiveLists]);

    // 타이밍 3 — 주기 폴링. verified 동안 일정 간격으로 갱신하되, 전환 진행 중
    // (isSiteSwitching/isSwitching)에는 옛 세션이 잠시 verified=true인 낙관 구간과 겹쳐 stale
    // fetch가 될 수 있으므로 건너뛴다(전환 확정은 위 상승 엣지가 처리).
    useEffect(() => {
        if (!isVerified || isSiteSwitching || isSwitching) return;
        const timer = setInterval(() => void refreshActiveLists(), LIST_REFRESH_POLL_MS);
        return () => clearInterval(timer);
    }, [isVerified, isSiteSwitching, isSwitching, refreshActiveLists]);

    // channel 목록 구독 — 낙관적 activeSiteId 기준. 클릭 즉시 캐시된 목록을 보여준다(반응성).
    useEffect(() => {
        if (!activeSiteId) {
            setChannels([]);
            return;
        }
        return repos.channel.observeList({ sid: activeSiteId }, result => {
            // On the relay/default cloud the channel cache read does NOT isolate by sid
            // (ChannelLocalDataSourceV2.cacheReadList bypasses the sid filter when cid==='default'),
            // so observeList can surface the previous site's channels mid-switch. Filter to the
            // active site here so a relay site switch never flashes the prior site's list. On a
            // cloud (cid!='default') the list is already sid-scoped, so this is a no-op.
            const list = (result?.list ?? []).filter(channel => channel.sid === activeSiteId);
            setChannels(list);
            metricsCollector.reportObservation('channel');
        });
    }, [repos.channel, activeSiteId]);

    // 보이는 채널 각각을 sync 타깃으로 등록 — lastChat$ 등을 실시간 갱신 (per-channel register).
    // 반드시 activeSiteId에 속한 채널만 등록한다(activeChannelIds) — 전환 직후 남아있는 이전 사이트
    // 채널을 등록하면 sync push가 그 채널을 새 sid로 mis-tag한다(위 주석 참조).
    useEffect(() => {
        if (!activeSiteId || activeChannelIds.length === 0) return;
        const sync = getSyncManager();
        const disposers = activeChannelIds.map(channelId => sync.registerChannel(channelId));
        return () => disposers.forEach(dispose => dispose());
    }, [activeSiteId, activeChannelIdsKey]);

    // 보이는 place 각각을 sync 타깃으로 등록 — place 메타 실시간 갱신 (per-place register).
    // place엔 list-delta 게이트웨이가 없어 목록 발견은 place.refreshList(위)가, 실시간은 이 register가 담당.
    useEffect(() => {
        if (siteIds.length === 0) return;
        const sync = getSyncManager();
        const disposers = siteIds.map(siteId => sync.registerPlace(siteId));
        return () => disposers.forEach(dispose => dispose());
    }, [siteIdsKey]);

    const handleCloudClick = async (cloudId: string) => {
        if (isSwitching) return;
        if (cloudId === cid) return;
        if (cloudId === DEFAULT_CLOUD_ID) {
            await logoutCloudSession();
        } else {
            // Invited clouds enter via the same switchCloud — the cache holds the real target
            // cid (not the AWS account-no), so the delegate exchange resolves correctly.
            await switchCloud(cloudId);
        }
    };

    const handleSiteClick = async (siteId: string) => {
        if (isSiteSwitching) return;
        // Optimistic sid pre-apply + commit + rollback-on-failure all live in switchSite.
        // The channel-list network fetch is a side effect of the switch and runs in the
        // verified-gated effect above (keyed on the new sid), not inline here.
        await switchSite(siteId);
    };

    // Write handlers for the manage dialogs. Each repo call cache-writes the result, so the
    // observeList subscriptions above re-emit and the lists refresh without a manual fetch. The
    // builders re-validate defensively (the dialog already gates empty names) and no-op on null.
    const handleCreatePlace = async (name: string) => {
        const payload = buildPlaceCreate(name);
        if (payload) await repos.place.createPlace(payload);
    };
    const handleEditPlace = (id: string) => async (name: string) => {
        const payload = buildPlaceUpdate(id, name);
        if (payload) await repos.place.updatePlace(payload);
    };
    const handleCreateChannel = async (name: string) => {
        const payload = buildChannelCreate(name);
        if (payload) await repos.channel.createChannel(payload);
    };
    const handleEditChannel = (id: string) => async (name: string) => {
        const payload = buildChannelUpdate(id, name);
        if (payload) await repos.channel.updateChannel(payload);
    };

    // Owned clouds come from the relay catalog, minus any that are also in the invite cache.
    const invitedCloudIds = new Set(invitedClouds.map(c => c.id ?? ''));
    const ownedClouds = clouds.filter(c => !invitedCloudIds.has(c.id ?? ''));
    const isRelayMode = session.activeServer.kind === 'relay';

    // Currently selected place (for the "현재 플레이스" summary) and a per-place channel count.
    const activeSite = sites.find(s => s.id === activeSiteId) ?? null;

    // Cloud dot: the active cloud uses its live total; other clouds fall back to the last-visited
    // snapshot (their channels aren't observed under the current cid scope).
    const cloudHasUnread = (id: string): boolean => (id === cid ? unreads.total : (cloudUnread[id] ?? 0)) > 0;

    return (
        <div className="p-4 space-y-5">
            {/* Cloud 영역 */}
            <section>
                <p className="text-xs font-semibold text-muted-foreground mb-2">내 클라우드</p>
                <div className="space-y-1">
                    <CloudItem
                        id={DEFAULT_CLOUD_ID}
                        name="기본 (relay)"
                        isActive={isRelayMode}
                        isPending={isSwitching}
                        hasUnread={cloudHasUnread(DEFAULT_CLOUD_ID)}
                        onClick={() => void handleCloudClick(DEFAULT_CLOUD_ID)}
                    />
                    {ownedClouds.map(c => (
                        <CloudItem
                            key={c.id ?? ''}
                            id={c.id ?? ''}
                            name={c.name ?? c.id ?? '—'}
                            isActive={cid === c.id}
                            isPending={isSwitching}
                            hasUnread={cloudHasUnread(c.id ?? '')}
                            onClick={() => void handleCloudClick(c.id ?? '')}
                        />
                    ))}
                </div>

                {invitedClouds.length > 0 && (
                    <>
                        <p className="text-xs font-semibold text-muted-foreground mt-4 mb-2">초대 클라우드</p>
                        <div className="space-y-1">
                            {invitedClouds.map(c => (
                                <CloudItem
                                    key={c.id ?? ''}
                                    id={c.id ?? ''}
                                    name={c.name ?? c.id ?? '—'}
                                    isActive={cid === c.id}
                                    isPending={isSwitching}
                                    isInvited
                                    hasUnread={cloudHasUnread(c.id ?? '')}
                                    onClick={() => void handleCloudClick(c.id ?? '')}
                                />
                            ))}
                        </div>
                    </>
                )}
            </section>

            {/* Place 목록 */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">사이트 (Place)</p>
                    <button
                        onClick={() => setManageDialog({ kind: 'createPlace' })}
                        className="text-xs px-2 py-1 rounded border border-primary text-primary hover:bg-primary/10"
                    >
                        + 새 플레이스
                    </button>
                </div>
                {sites.length === 0 ? (
                    <p className="text-xs text-muted-foreground">현재 클라우드에 연결 가능한 사이트가 없습니다</p>
                ) : (
                    <div className="space-y-1">
                        {sites.map(s => (
                            <div key={s.id} className="flex items-center gap-1">
                                <button
                                    onClick={() => void handleSiteClick(s.id)}
                                    disabled={isSiteSwitching}
                                    className={`flex-1 text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                                        activeSiteId === s.id
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-card hover:bg-accent'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-medium">{s.name ?? s.id}</p>
                                        {/* presence dot: any unread channel in this place */}
                                        {(unreads.byPlace[s.id] ?? 0) > 0 && (
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
                                </button>
                                <button
                                    onClick={() => setManageDialog({ kind: 'editPlace', id: s.id, name: s.name ?? '' })}
                                    className="shrink-0 px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
                                    title="이름 수정"
                                >
                                    ✎
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Channel 목록 */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">채널</p>
                    <button
                        onClick={() => setManageDialog({ kind: 'createChannel' })}
                        disabled={!activeSiteId}
                        className="text-xs px-2 py-1 rounded border border-primary text-primary hover:bg-primary/10 disabled:opacity-50"
                        title={activeSiteId ? '새 채널' : '사이트를 먼저 선택하세요'}
                    >
                        + 새 채널
                    </button>
                </div>

                {/* 현재 플레이스 정보 요약 */}
                {activeSite && (
                    <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-primary truncate">
                                {activeSite.name ?? activeSite.id}
                            </p>
                            <span className="text-xs text-muted-foreground shrink-0">채널 {channels.length}개</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{activeSite.id}</p>
                    </div>
                )}

                {!activeSiteId ? (
                    <p className="text-xs text-muted-foreground">상단에서 클라우드와 사이트를 먼저 선택해 주세요</p>
                ) : channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        아직 사이트 세션에 연결되지 않아 채널을 불러오지 못했습니다
                    </p>
                ) : (
                    <div className="space-y-1">
                        {/* Unread is client-computed (user messages only) so system join/leave events
                            don't inflate the badge; the last-message preview comes from ChannelRow's
                            own chat sync (server no longer embeds lastChat$). */}
                        {channels.map(ch => (
                            <ChannelRow
                                key={ch.id}
                                channel={ch}
                                unread={unreads.byChannel[ch.id] ?? 0}
                                onOpen={() => navigate(`/chat/channels/${ch.id}`)}
                                onEdit={() => setManageDialog({ kind: 'editChannel', id: ch.id, name: ch.name ?? '' })}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* 생성/이름수정 다이얼로그 — 한 번에 하나만 연다 */}
            {manageDialog?.kind === 'createPlace' && (
                <NameFormDialog
                    title="새 플레이스"
                    label="플레이스 이름"
                    submitLabel="생성"
                    onSubmit={handleCreatePlace}
                    onClose={() => setManageDialog(null)}
                />
            )}
            {manageDialog?.kind === 'editPlace' && (
                <NameFormDialog
                    title="플레이스 이름 수정"
                    label="플레이스 이름"
                    initialValue={manageDialog.name}
                    onSubmit={handleEditPlace(manageDialog.id)}
                    onClose={() => setManageDialog(null)}
                />
            )}
            {manageDialog?.kind === 'createChannel' && (
                <NameFormDialog
                    title="새 채널"
                    label="채널 이름"
                    submitLabel="생성"
                    onSubmit={handleCreateChannel}
                    onClose={() => setManageDialog(null)}
                />
            )}
            {manageDialog?.kind === 'editChannel' && (
                <NameFormDialog
                    title="채널 이름 수정"
                    label="채널 이름"
                    initialValue={manageDialog.name}
                    onSubmit={handleEditChannel(manageDialog.id)}
                    onClose={() => setManageDialog(null)}
                />
            )}
        </div>
    );
};

interface CloudItemProps {
    id: string;
    name: string;
    isActive: boolean;
    isPending: boolean;
    isInvited?: boolean;
    hasUnread?: boolean;
    onClick: () => void;
}

const CloudItem = ({ id, name, isActive, isPending, isInvited, hasUnread, onClick }: CloudItemProps) => (
    <button
        onClick={onClick}
        disabled={isPending}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
            isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent'
        }`}
    >
        <div className="flex items-center gap-2">
            <p className="font-medium flex-1">{name}</p>
            {/* presence dot: any unread across this cloud's places */}
            {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            {isInvited && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">초대</span>}
            {isActive && <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">활성</span>}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{id}</p>
    </button>
);

interface ChannelRowProps {
    channel: DomainChannel;
    unread: number;
    onOpen: () => void;
    onEdit: () => void;
}

// A single channel row. Extracted so it can register + prime a per-row chat sync via useLastChat and
// read the channel's latest cached message — the last-message preview source now that the server no
// longer embeds lastChat$ on the channel. Registration unregisters on unmount (row leaves the list).
const ChannelRow = ({ channel, unread, onOpen, onEdit }: ChannelRowProps) => {
    const lastChat = useLastChat(channel.id);
    return (
        <div className="flex items-center gap-1">
            <button
                onClick={onOpen}
                className="flex-1 text-left px-3 py-2 rounded-lg text-sm border border-border bg-card hover:bg-accent transition-colors"
            >
                <div className="flex items-center gap-2">
                    <p className="font-medium truncate flex-1">{channel.name ?? channel.id}</p>
                    {lastChat?.createdAt != null && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatChatTime(lastChat.createdAt)}
                        </span>
                    )}
                    {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                            {unread}
                        </span>
                    )}
                </div>
                {lastChat && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {(lastChat.owner$?.name ?? lastChat.ownerId) && (
                            <span className="font-medium">{lastChat.owner$?.name ?? lastChat.ownerId}: </span>
                        )}
                        {lastChat.content ?? ''}
                    </p>
                )}
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
                    <span>#{channel.chatNo ?? 0}</span>
                    {channel.memberNo != null && <span>멤버 {channel.memberNo}</span>}
                    <span className="truncate">{channel.id}</span>
                </div>
            </button>
            <button
                onClick={onEdit}
                className="shrink-0 px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
                title="이름 수정"
            >
                ✎
            </button>
        </div>
    );
};
