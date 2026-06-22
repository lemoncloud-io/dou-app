import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useGlobalSession,
    useCloudSessionCatalog,
    useSessionSelection,
    useSwitchCloudSession,
    useLogoutCloudSession,
    useRefreshCloudSiteSession,
} from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainChannel, DomainInviteCloud, DomainSite } from '@chatic/data';

const DEFAULT_CLOUD_ID = 'default';

export const ChatHomePage = () => {
    const navigate = useNavigate();
    const session = useGlobalSession();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { clouds } = useCloudSessionCatalog();
    const { switchCloud, isPending: isSwitching } = useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { refreshSiteSession } = useRefreshCloudSiteSession();

    // Cast to V2 — app-runtime dist is stale (V1 return type), source is V2
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    const [sites, setSites] = useState<DomainSite[]>([]);
    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [invitedCloudIds, setInvitedCloudIds] = useState<Set<string>>(new Set());
    const [activeSiteId, setActiveSiteId] = useState<string | null>(selectedSiteId);

    // invite cloud 목록 구독
    useEffect(() => {
        return repos.inviteCloud.observeList(result => {
            const ids = new Set((result?.list ?? []).map((c: DomainInviteCloud) => c.id));
            setInvitedCloudIds(ids);
        });
    }, [repos.inviteCloud]);

    // site 목록 구독
    useEffect(() => {
        return repos.site.observeList(undefined, result => {
            setSites(result?.list ?? []);
        });
    }, [repos.site]);

    // site 목록 원격 갱신
    useEffect(() => {
        void repos.site.refreshList();
    }, [repos.site, selectedCloudId]);

    // activeSiteId를 session과 동기화
    useEffect(() => {
        setActiveSiteId(selectedSiteId);
    }, [selectedSiteId]);

    // channel 목록 구독
    useEffect(() => {
        if (!activeSiteId) {
            setChannels([]);
            return;
        }
        return repos.channel.observeList({ sid: activeSiteId }, result => {
            setChannels(result?.list ?? []);
        });
    }, [repos.channel, activeSiteId]);

    // channel 목록 원격 갱신
    useEffect(() => {
        if (!activeSiteId) return;
        void repos.channel.refreshList({ sid: activeSiteId });
    }, [repos.channel, activeSiteId]);

    const handleCloudClick = async (cloudId: string) => {
        if (isSwitching) return;
        if (cloudId === selectedCloudId) return;
        if (cloudId === DEFAULT_CLOUD_ID) {
            await logoutCloudSession();
        } else {
            await switchCloud(cloudId);
        }
    };

    const handleSiteClick = async (siteId: string) => {
        setActiveSiteId(siteId);
        await refreshSiteSession(siteId);
    };

    const ownedClouds = clouds.filter(c => !invitedCloudIds.has(c.id ?? ''));
    const invitedClouds = clouds.filter(c => invitedCloudIds.has(c.id ?? ''));
    const isRelayMode = session.activeServer.kind === 'relay';

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
                        onClick={() => void handleCloudClick(DEFAULT_CLOUD_ID)}
                    />
                    {ownedClouds.map(c => (
                        <CloudItem
                            key={c.id ?? ''}
                            id={c.id ?? ''}
                            name={c.name ?? c.id ?? '—'}
                            isActive={selectedCloudId === c.id && !isRelayMode}
                            isPending={isSwitching}
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
                                    isActive={selectedCloudId === c.id && !isRelayMode}
                                    isPending={isSwitching}
                                    isInvited
                                    onClick={() => void handleCloudClick(c.id ?? '')}
                                />
                            ))}
                        </div>
                    </>
                )}
            </section>

            {/* Place 목록 */}
            <section>
                <p className="text-xs font-semibold text-muted-foreground mb-2">사이트 (Place)</p>
                {sites.length === 0 ? (
                    <p className="text-xs text-muted-foreground">현재 클라우드에 연결 가능한 사이트가 없습니다</p>
                ) : (
                    <div className="space-y-1">
                        {sites.map(s => (
                            <button
                                key={s.id}
                                onClick={() => void handleSiteClick(s.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                                    activeSiteId === s.id
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border bg-card hover:bg-accent'
                                }`}
                            >
                                <p className="font-medium">{s.name ?? s.id}</p>
                                <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Channel 목록 */}
            <section>
                <p className="text-xs font-semibold text-muted-foreground mb-2">채널</p>
                {!activeSiteId ? (
                    <p className="text-xs text-muted-foreground">상단에서 클라우드와 사이트를 먼저 선택해 주세요</p>
                ) : channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        아직 사이트 세션에 연결되지 않아 채널을 불러오지 못했습니다
                    </p>
                ) : (
                    <div className="space-y-1">
                        {channels.map(ch => (
                            <button
                                key={ch.id}
                                onClick={() => navigate(`/chat/channels/${ch.id}`)}
                                className="w-full text-left px-3 py-2 rounded-lg text-sm border border-border bg-card hover:bg-accent transition-colors"
                            >
                                <p className="font-medium">{ch.name ?? ch.id}</p>
                                {ch.lastChat$ && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {ch.lastChat$.content ?? ''}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

interface CloudItemProps {
    id: string;
    name: string;
    isActive: boolean;
    isPending: boolean;
    isInvited?: boolean;
    onClick: () => void;
}

const CloudItem = ({ id, name, isActive, isPending, isInvited, onClick }: CloudItemProps) => (
    <button
        onClick={onClick}
        disabled={isPending}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
            isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent'
        }`}
    >
        <div className="flex items-center gap-2">
            <p className="font-medium flex-1">{name}</p>
            {isInvited && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">초대</span>}
            {isActive && <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">활성</span>}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{id}</p>
    </button>
);
