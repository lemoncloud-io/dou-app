import type {
    CloudHttpGateway,
    OAuthHttpGateway,
    ReportHttpGateway,
    SubscriptionHttpGateway,
    UserHttpGateway,
} from '@chatic/http';

/**
 * The full OAuth command surface, token-producing actions included.
 *
 * They used to be excluded ("session material is not `data`'s to touch") and `session/auth` drove
 * `OAuthHttpGateway` directly instead. That exclusion did not hold up: `AuthRepositoryV2` already
 * performs a token-producing call on the socket lane — `confirmPhoneCode` returns a `$token` that IS
 * a new session — under an explicit rule that the repository **performs the call but never interprets
 * or installs the token**. The HTTP lane now follows the same rule instead of a different one.
 *
 * What stays true is the rule, not the absence: nothing under `data/` reads `Token`, writes a store,
 * or flips auth state. Responses pass through raw so `session/auth` — the only caller — can.
 *
 * `refreshCloudToken`/`refreshAuthToken` are not here and cannot be: the wire vocabulary itself no
 * longer has them (ADR-0070 결정 2, `gateways/refreshAbsence.spec.ts`).
 */
export type AuthHttpDomainGateway = Pick<
    OAuthHttpGateway,
    | 'registerUser'
    | 'registerUserV2'
    | 'findAlias'
    | 'verifyAlias'
    | 'loginInvite'
    | 'inviteInfo'
    | 'registerDevice'
    | 'login'
    | 'verifyNativeToken'
    | 'exchangeCode'
    | 'delegateCloud'
    | 'exchangeToken'
>;
export type UserHttpDomainGateway = Pick<UserHttpGateway, 'list' | 'tryProfile' | 'updateProfile' | 'registerDevice'>;
export type CloudHttpDomainGateway = Pick<CloudHttpGateway, 'list' | 'update' | 'make' | 'release' | 'verifyEmail'>;
export type SubscriptionHttpDomainGateway = Pick<
    SubscriptionHttpGateway,
    'plans' | 'validateGoogle' | 'validateApple' | 'receipts' | 'receiptDetail' | 'membership' | 'validateMembership'
>;

/**
 * Diagnostics, not domain data — but a data call all the same, so it comes through here like the
 * rest (ADR-0036: 모든 데이터 콜은 repository를 거친다). Both methods are taken: unlike the OAuth
 * bundle there is nothing on this gateway to withhold, and the `Pick<>` stays only so the contract
 * keeps being consumer-owned.
 */
export type ReportHttpDomainGateway = Pick<ReportHttpGateway, 'reportIssue' | 'uploadLogBatch'>;

export interface HttpGatewayBundle {
    auth: AuthHttpDomainGateway;
    user: UserHttpDomainGateway;
    cloud: CloudHttpDomainGateway;
    subscription: SubscriptionHttpDomainGateway;
    report: ReportHttpDomainGateway;
}
