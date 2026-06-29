import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useGlobalSession,
    useSessionLogout,
    useLogoutCloudSession,
    useSessionIdentity,
    useSessionSelection,
} from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainProfile } from '@chatic/data';

export const SettingsPage = () => {
    const navigate = useNavigate();
    const session = useGlobalSession();
    const identity = useSessionIdentity();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const logout = useSessionLogout();
    const { logoutCloudSession, isLoggingOutCloudSession } = useLogoutCloudSession();

    // Cast to V2 — app-runtime dist is stale (V1 return type), source is V2
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    const isRelayMode = session.activeServer.kind === 'relay';
    const hasCloudSession = session.cloud.isActive;

    // 본인 사이트 프로필 id는 `${sid}@${uid}`. 활성 사이트가 있을 때만 동기화한다.
    const profileId = selectedSiteId && identity.userId ? `${selectedSiteId}@${identity.userId}` : undefined;
    const [profile, setProfile] = useState<DomainProfile | null>(null);

    // 캐시 스트림 구독 — register가 채운 프로필을 관측해 표시한다.
    useEffect(() => {
        if (!profileId) {
            setProfile(null);
            return;
        }
        return repos.profile.observeItem(profileId, setProfile);
    }, [repos.profile, profileId]);

    const handleRelayLogout = () => {
        void logout();
    };

    const handleCloudLogout = () => {
        void logoutCloudSession();
    };

    return (
        <div className="p-4 space-y-6">
            {/* 페이지 이동 */}
            <section className="space-y-2">
                <button
                    onClick={() => navigate('/auth/login')}
                    className="w-full px-4 py-3 rounded-lg border border-primary text-primary text-sm font-medium text-center hover:bg-primary/10 transition-colors"
                >
                    로그인 페이지로 이동
                </button>
                <button
                    onClick={() => navigate('/invite')}
                    className="w-full px-4 py-3 rounded-lg border border-primary text-primary text-sm font-medium text-center hover:bg-primary/10 transition-colors"
                >
                    초대 수락 페이지로 이동
                </button>
            </section>

            {/* 로그인 상태 요약 */}
            <section className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">현재 세션 상태</p>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <StatusRow label="relay 인증" value={session.relay.isAuthenticated ? '✓ 인증됨' : '미인증'} />
                    <StatusRow label="cloud 인증" value={hasCloudSession ? '✓ 인증됨' : '미연결'} />
                    <StatusRow label="active server" value={session.activeServer.kind} />
                    <StatusRow label="cloud ID" value={selectedCloudId} />
                    <StatusRow label="site ID" value={selectedSiteId} />
                    <StatusRow
                        label="사용자"
                        value={
                            identity.isGuest
                                ? `게스트 (${identity.userId?.slice(0, 12) ?? '—'})`
                                : `${identity.userName} (${identity.userRole})`
                        }
                    />
                    <StatusRow
                        label="프로필(sync)"
                        value={
                            profileId
                                ? profile
                                    ? `${profile.nick ?? profile.id} · ${profile.updatedAtMs ?? '—'}`
                                    : '동기화 대기…'
                                : '사이트 미선택'
                        }
                    />
                </div>
            </section>

            {/* 로그아웃 액션 */}
            <section className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">세션 액션</p>

                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                    <div>
                        <p className="text-sm font-medium mb-1">Cloud 로그아웃</p>
                        <p className="text-xs text-muted-foreground mb-2">
                            현재 cloud 세션만 종료합니다. relay 세션은 유지됩니다. 기본 클라우드로 복귀합니다.
                        </p>
                        <button
                            onClick={handleCloudLogout}
                            disabled={!hasCloudSession || isRelayMode || isLoggingOutCloudSession}
                            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-40 hover:opacity-80 transition-opacity"
                        >
                            {isLoggingOutCloudSession ? '처리 중...' : 'Cloud 로그아웃'}
                        </button>
                    </div>

                    <div className="border-t border-border pt-3">
                        <p className="text-sm font-medium mb-1">중계서버 로그아웃</p>
                        <p className="text-xs text-muted-foreground mb-2">
                            relay 세션과 cloud 상태를 모두 종료합니다. 종료 후 앱이 자동으로 guest 상태로 재진입합니다.
                        </p>
                        <button
                            onClick={handleRelayLogout}
                            className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-80 transition-opacity"
                        >
                            Relay 로그아웃
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};

const StatusRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex gap-2 text-sm">
        <span className="text-muted-foreground w-24 shrink-0">{label}</span>
        <span className="font-mono text-xs break-all">{value ?? '—'}</span>
    </div>
);
