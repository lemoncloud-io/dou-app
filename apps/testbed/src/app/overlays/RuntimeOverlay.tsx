import { useGlobalSession, useSessionAuth } from '@chatic/web-core';
import { useSocketState } from '@chatic/app-runtime';

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

    const { relay, cloud, identity, activeServer } = session;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
            <div className="w-full max-w-lg max-h-[80dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Runtime 상태</span>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>

                <Section title="Session">
                    <Row label="initialized" value={String(isInitialized)} />
                    <Row label="authenticated" value={String(isAuthenticated)} />
                    <Row label="isGuest" value={String(identity.isGuest)} />
                    <Row label="isInvited" value={String(identity.isInvited)} />
                    <Row label="userType" value={identity.userType} />
                    <Row label="userId" value={identity.userId} />
                    <Row label="delegatorId" value={identity.delegatorId} />
                    <Row label="userName" value={identity.userName} />
                    <Row label="userRole" value={identity.userRole} />
                    <Row label="oAuthProvider" value={identity.oAuthProvider} />
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
                    <Row label="isDeviceReg" value={String(socketState.isDeviceRegistered)} />
                    <Row label="connectionId" value={socketState.connectionId} />
                </Section>
            </div>
        </div>
    );
};
