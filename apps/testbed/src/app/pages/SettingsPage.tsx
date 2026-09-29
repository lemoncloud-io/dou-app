import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runtime } from '@chatic/app-runtime';
import type { DataRepositories, DomainProfile } from '@chatic/data';

export const SettingsPage = () => {
    const navigate = useNavigate();
    const session = runtime.session.useGlobalSession();
    const identity = runtime.session.useSessionIdentity();
    const facts = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const logout = runtime.session.useSessionLogout();
    const { logoutCloudSession, isLoggingOutCloudSession } = runtime.session.useLogoutCloudSession();

    // Cast to V2 — app-runtime dist is stale (V1 return type), source is V2
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;

    const isRelayMode = session.activeServer.kind === 'relay';
    const hasCloudSession = session.cloud.isActive;

    // The user's own site profile id is `${sid}@${uid}`. Only syncs when there's an active site.
    const profileId = selectedSiteId && identity.userId ? `${selectedSiteId}@${identity.userId}` : undefined;
    const [profile, setProfile] = useState<DomainProfile | null>(null);

    // Subscribe to the cache stream — observes and displays the profile that register populated.
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
            {/* Page navigation */}
            <section className="space-y-2">
                <button
                    onClick={() => navigate('/auth/login')}
                    className="w-full px-4 py-3 rounded-lg border border-primary text-primary text-sm font-medium text-center hover:bg-primary/10 transition-colors"
                >
                    Go to login page
                </button>
                <button
                    onClick={() => navigate('/invite')}
                    className="w-full px-4 py-3 rounded-lg border border-primary text-primary text-sm font-medium text-center hover:bg-primary/10 transition-colors"
                >
                    Go to accept-invite page
                </button>
            </section>

            {/* Login status summary */}
            <section className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Current session status</p>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <StatusRow
                        label="relay auth"
                        value={session.relay.isAuthenticated ? '✓ authenticated' : 'not authenticated'}
                    />
                    <StatusRow label="cloud auth" value={hasCloudSession ? '✓ authenticated' : 'not connected'} />
                    <StatusRow label="active server" value={session.activeServer.kind} />
                    <StatusRow label="cloud ID" value={selectedCloudId} />
                    <StatusRow label="site ID" value={selectedSiteId} />
                    <StatusRow
                        label="user"
                        value={
                            facts.isGuest
                                ? `Guest (${identity.userId?.slice(0, 12) ?? '—'})`
                                : `${facts.userName} (${facts.userRole})`
                        }
                    />
                    <StatusRow
                        label="profile (sync)"
                        value={
                            profileId
                                ? profile
                                    ? `${profile.nick ?? profile.id} · ${profile.updatedAtMs ?? '—'}`
                                    : 'Waiting to sync…'
                                : 'No site selected'
                        }
                    />
                </div>
            </section>

            {/* Logout actions */}
            <section className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Session actions</p>

                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                    <div>
                        <p className="text-sm font-medium mb-1">Cloud logout</p>
                        <p className="text-xs text-muted-foreground mb-2">
                            Ends only the current cloud session. The relay session is kept. Falls back to the default
                            cloud.
                        </p>
                        <button
                            onClick={handleCloudLogout}
                            disabled={!hasCloudSession || isRelayMode || isLoggingOutCloudSession}
                            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-40 hover:opacity-80 transition-opacity"
                        >
                            {isLoggingOutCloudSession ? 'Working...' : 'Cloud logout'}
                        </button>
                    </div>

                    <div className="border-t border-border pt-3">
                        <p className="text-sm font-medium mb-1">Relay logout</p>
                        <p className="text-xs text-muted-foreground mb-2">
                            Ends both the relay session and the cloud state. The app automatically re-enters the guest
                            state afterward.
                        </p>
                        <button
                            onClick={handleRelayLogout}
                            className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-80 transition-opacity"
                        >
                            Relay logout
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
