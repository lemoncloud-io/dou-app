import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

// User classification (userType) and permission policy no longer live in web-core. They are derived
// in the app layer from the raw identity facts (userRole / isGuest / isCloudActive) exposed by
// app-runtime's useProfileFacts — see apps/web's useUserPermissions.

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

/**
 * Session identity is state storage only. It carries the `uid` (derived from the active session
 * token, for cache observing) and the `delegatorId` (a guest's own uid, for invite acceptance). The
 * profile payload (UserProfile$) is NOT stored — the raw token is persisted for auth, and profile
 * facts (userRole / isGuest / userType / permissions / name / photo) are tracked from the cached
 * profile via `useProfileFacts` (@chatic/app-runtime), seeded synchronously from the active token's
 * user fields (`getActiveSessionUser`). Invited-ness lives in the cached cloud (`cloudType:
 * 'invited'`), and the OAuth provider is no longer session state.
 */
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

export type CloudSessionIssueTokenResult = {
    cloudDelegationToken: CloudDelegationTokenView;
    userToken: UserTokenView;
};
