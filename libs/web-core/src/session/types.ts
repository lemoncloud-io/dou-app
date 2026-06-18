import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

export type SessionProfileKind = 'relay' | 'cloud';

export interface BaseSessionContext {
    backend: string | null;
    wss: string | null;
    identityToken: string | null;
    siteId: string | null;
}

export interface RelaySessionContext extends BaseSessionContext {
    isAuthenticated: boolean;
}

export interface CloudSessionContext extends BaseSessionContext {
    cloudId: string | null;
    delegationToken: CloudDelegationTokenView | null;
    cloudToken: UserTokenView | null;
}

export interface SessionIdentityContext {
    userId: string | null;
    delegatorId: string | null;
    userRole: string | null;
}

export type ActiveRuntimeTarget =
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
    relay: RelaySessionContext;
    cloud: CloudSessionContext;
    identity: SessionIdentityContext;
    activeTarget: ActiveRuntimeTarget;
}

export interface CloudSessionSnapshot {
    cloudId: string;
    siteId: string | null;
    identityToken: string | null;
    backend: string | null;
    wss: string | null;
}

export type CloudSessionIssueTokenResult = {
    cloudDelegationToken: CloudDelegationTokenView;
    userToken: UserTokenView;
};

export type IssueCloudToken = (cloudId: string) => Promise<CloudSessionIssueTokenResult>;
export type RefreshCloudToken = (target?: string) => Promise<UserTokenView>;
