import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import { applyInvitedCloud, cloudCore } from '../cloud';
import { getDelegatorId, useWebCoreStore } from '../stores/useWebCoreStore';
import { clearRelayTransportOverrides } from '../transport';
import type { CloudSessionContext, RelaySessionContext, SessionIdentityContext, SessionProfileKind } from './types';
import { relayCore } from '../core';

export interface SessionProfile {
    kind: SessionProfileKind;
    getBackend(): string | null;
    getWss(): string | null;
    getIdentityToken(): string | null;
    getSelectedCloudId(): string | null;
    getSelectedSiteId(): string | null;
    clearSession(): void;
}

export interface RelaySessionProfile extends SessionProfile {
    kind: 'relay';
    isAuthenticated(): boolean;
    toContext(): RelaySessionContext;
}

export interface CloudSessionProfile extends SessionProfile {
    kind: 'cloud';
    getDelegationToken(): CloudDelegationTokenView | null;
    saveDelegationToken(token: CloudDelegationTokenView): void;
    clearDelegationToken(): void;
    getCloudToken(): UserTokenView | null;
    saveCloudToken(token: UserTokenView): void;
    saveSelectedCloudId(cloudId: string): void;
    saveSelectedSiteId(siteId: string): void;
    clearSelectedSite(): void;
    clearPlaceOrder(cloudId: string): void;
    applyInvitedCloud(cloudId: string): boolean;
    toContext(): CloudSessionContext;
}

class RelaySessionProfileAdapter implements RelaySessionProfile {
    public readonly kind = 'relay' as const;

    public getBackend(): string {
        return relayCore.getBackend();
    }

    public getWss(): string {
        return relayCore.getWss();
    }

    public getIdentityToken(): string | null {
        return null;
    }

    public getSelectedCloudId(): string {
        return 'default';
    }

    public getSelectedSiteId(): string | null {
        return relayCore.getSelectedSiteId();
    }

    public isAuthenticated(): boolean {
        return useWebCoreStore.getState().isAuthenticated;
    }

    public clearSession(): void {
        relayCore.clearSelectedSite();
        clearRelayTransportOverrides();
    }

    public toContext(): RelaySessionContext {
        return {
            backend: this.getBackend(),
            wss: this.getWss(),
            identityToken: this.getIdentityToken(),
            siteId: this.getSelectedSiteId(),
            isAuthenticated: this.isAuthenticated(),
        };
    }
}

class CloudSessionProfileAdapter implements CloudSessionProfile {
    public readonly kind = 'cloud' as const;

    public getBackend(): string | null {
        return cloudCore.getBackend();
    }

    public getWss(): string | null {
        return cloudCore.getWss();
    }

    public getIdentityToken(): string | null {
        return cloudCore.getIdentityToken();
    }

    public getSelectedCloudId(): string | null {
        return cloudCore.getSelectedCloudId();
    }

    public getSelectedSiteId(): string | null {
        return cloudCore.getSelectedSiteId();
    }

    public getDelegationToken(): CloudDelegationTokenView | null {
        return cloudCore.getDelegationToken();
    }

    public saveDelegationToken(token: CloudDelegationTokenView): void {
        cloudCore.saveDelegationToken(token);
    }

    public clearDelegationToken(): void {
        cloudCore.clearDelegationToken();
    }

    public getCloudToken(): UserTokenView | null {
        return cloudCore.getCloudToken();
    }

    public saveCloudToken(token: UserTokenView): void {
        cloudCore.saveCloudToken(token);
    }

    public saveSelectedCloudId(cloudId: string): void {
        cloudCore.saveSelectedCloudId(cloudId);
    }

    public saveSelectedSiteId(siteId: string): void {
        cloudCore.saveSelectedSiteId(siteId);
    }

    public clearSelectedSite(): void {
        cloudCore.clearSelectedSite();
    }

    public clearPlaceOrder(cloudId: string): void {
        cloudCore.clearPlaceOrder(cloudId);
    }

    public applyInvitedCloud(cloudId: string): boolean {
        return applyInvitedCloud(cloudId);
    }

    public clearSession(): void {
        cloudCore.clearSession();
    }

    public toContext(): CloudSessionContext {
        return {
            cloudId: this.getSelectedCloudId(),
            siteId: this.getSelectedSiteId(),
            backend: this.getBackend(),
            wss: this.getWss(),
            identityToken: this.getIdentityToken(),
            delegationToken: this.getDelegationToken(),
            cloudToken: this.getCloudToken(),
        };
    }
}

export interface SessionProfileResolver {
    getRelayProfile(): RelaySessionProfile;
    getCloudProfile(): CloudSessionProfile;
    getIdentityContext(): SessionIdentityContext;
    getActiveProfile(): SessionProfile;
}

class DefaultSessionProfileResolver implements SessionProfileResolver {
    private readonly relayProfile = new RelaySessionProfileAdapter();
    private readonly cloudProfile = new CloudSessionProfileAdapter();

    public getRelayProfile(): RelaySessionProfile {
        return this.relayProfile;
    }

    public getCloudProfile(): CloudSessionProfile {
        return this.cloudProfile;
    }

    public getIdentityContext(): SessionIdentityContext {
        const { profile } = useWebCoreStore.getState();
        const userRole = (profile?.$user as { userRole?: string } | undefined)?.userRole ?? null;
        return {
            userId: profile?.uid ?? null,
            delegatorId: getDelegatorId(),
            userRole,
        };
    }

    public getActiveProfile(): SessionProfile {
        const cloudProfile = this.getCloudProfile();
        if (
            cloudProfile.getSelectedCloudId() &&
            cloudProfile.getBackend() &&
            cloudProfile.getWss() &&
            cloudProfile.getIdentityToken()
        ) {
            return cloudProfile;
        }
        return this.getRelayProfile();
    }
}

export const sessionProfileResolver: SessionProfileResolver = new DefaultSessionProfileResolver();
