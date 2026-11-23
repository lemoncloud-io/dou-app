export interface RelaySessionView {
    backend: string | null;
    wss: string | null;
    siteId: string | null;
    isAuthenticated: boolean;
}

export interface CloudSessionView {
    cloudId: string | null;
    siteId: string | null;
    backend: string | null;
    wss: string | null;
    isActive: boolean;
}

export interface IdentityView {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: string | null;
    userId: string | null;
    delegatorId: string | null;
}

export type ActiveServerView =
    | { kind: 'relay'; backend: string; wss: string; siteId: string | null }
    | { kind: 'cloud'; cloudId: string; siteId: string | null; backend: string; wss: string };

export interface SessionContextView {
    relay: RelaySessionView;
    cloud: CloudSessionView;
    identity: IdentityView;
    activeServer: ActiveServerView;
}

export interface SessionAuthView {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: string | null;
}

export type SessionUserView = Record<string, unknown>;

export interface PairingView {
    isPairedSession: boolean;
    isInOwnCloudSession: boolean;
    cloudIds: string[];
    cloudNames: Record<string, string>;
}

export interface SessionSnapshot {
    context: SessionContextView;
    auth: SessionAuthView;
    activeUser: SessionUserView | null;
    relayUser: SessionUserView | null;
    committedSiteId: string | null;
    uidByCloud: Record<string, string>;
    pairing: PairingView;
}

export interface SessionView {
    snapshot(): SessionSnapshot;
    subscribe(listener: () => void): () => void;
    onLogout(listener: () => void): () => void;
}
