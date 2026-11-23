import type { AuthControllerState, ClientSocketState } from '@lemoncloud/chatic-sockets-lib';

import { credentialFreshness, cloudStore, relayStore } from '@chatic/session';
import type { ICredentialFreshness } from '@chatic/session';
import { SDK_REFRESH_CYCLE_MS, getSocketManager, kindOf } from '@chatic/transport';
import type { ISocketManager, SlotKey, SocketKind } from '@chatic/transport';

export type AuthStatus = 'absent' | 'handshaking' | 'verified' | 'stale' | 'expired';

export interface AuthSignals {
    readonly hasToken: boolean;
    readonly verifiedOnThisConnection: boolean;
    readonly controller: AuthControllerState | null;
    readonly credentialMs: number | null;
    readonly marginMs: number;
    readonly storedSessionExpired: boolean | null;
}

export interface SocketAuthSnapshot extends AuthSignals {
    readonly kind: SocketKind;
    readonly status: AuthStatus;
    readonly transport: ClientSocketState | null;
}

export const deriveAuthStatus = (signals: AuthSignals): AuthStatus => {
    if (!signals.hasToken) return 'absent';
    if (signals.controller === 'expired') return 'expired';
    if (!signals.verifiedOnThisConnection) return 'handshaking';
    if (signals.storedSessionExpired === true) return 'stale';
    if (signals.credentialMs == null || signals.credentialMs <= signals.marginMs) return 'stale';
    return 'verified';
};

export const canRefreshThroughSocket = (status: AuthStatus): boolean => status === 'verified' || status === 'stale';

export const needsSocketKick = (status: AuthStatus): boolean => status === 'handshaking' || status === 'expired';

export const needsLivenessProbe = (status: AuthStatus): boolean => status === 'verified' || status === 'stale';

const DEFAULT_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

export interface AuthSignalDeps {
    manager?: Pick<ISocketManager, 'getClient' | 'isSlotVerified'>;
    freshness?: Pick<ICredentialFreshness, 'timeToExpiry'>;
    marginMs?: number;
    storedSessionExpired?: boolean | null;
}

const readAuthSignals = (key: SlotKey, deps: AuthSignalDeps = {}): AuthSignals => {
    const manager = deps.manager ?? getSocketManager();
    const freshness = deps.freshness ?? credentialFreshness;
    const identityToken =
        kindOf(key) === 'relay' ? relayStore.getIdentityToken() : cloudStore.getCloudTokenOf(key)?.Token?.identityToken;

    return {
        hasToken: !!identityToken,
        verifiedOnThisConnection: manager.isSlotVerified(key),
        controller: manager.getClient(key)?.auth?.state ?? null,
        credentialMs: freshness.timeToExpiry(key),
        marginMs: deps.marginMs ?? DEFAULT_MARGIN_MS,
        storedSessionExpired: deps.storedSessionExpired ?? null,
    };
};

export const getAuthStatus = (key: SlotKey, deps: AuthSignalDeps = {}): AuthStatus =>
    deriveAuthStatus(readAuthSignals(key, deps));

export const getAuthSnapshot = (key: SlotKey, deps: AuthSignalDeps = {}): SocketAuthSnapshot => {
    const manager = deps.manager ?? getSocketManager();
    const signals = readAuthSignals(key, deps);
    return {
        ...signals,
        kind: kindOf(key),
        status: deriveAuthStatus(signals),
        transport: manager.getClient(key)?.state ?? null,
    };
};
