import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

export interface BaseServerContext {
    backend: string | null;
    wss: string | null;
    identityToken: string | null;
    siteId: string | null;
}

export interface RelayContext extends BaseServerContext {
    isAuthenticated: boolean;
}

export interface CloudContext extends BaseServerContext {
    cloudId: string | null;
    delegationToken: CloudDelegationTokenView | null;
    cloudToken: UserTokenView | null;
    isActive: boolean;
}

export interface IdentityContext {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: Error | null;
    userId: string | null;
    delegatorId: string | null;
}

export type ActiveServerContext =
    | {
          kind: 'relay';
          backend: string;
          wss: string;
          siteId: string | null;
          identityToken: string | null;
      }
    | {
          kind: 'cloud';
          cloudId: string;
          siteId: string | null;
          backend: string;
          wss: string;
          identityToken: string;
      };

export interface GlobalSessionContext {
    relay: RelayContext;
    cloud: CloudContext;
    identity: IdentityContext;
    activeServer: ActiveServerContext;
}

export interface CloudSessionSnapshot {
    cloudId: string;
    siteId: string | null;
    identityToken: string | null;
    backend: string | null;
    wss: string | null;
}
