import type {
    CloudHttpGateway,
    MiniAppHttpGateway,
    OAuthHttpGateway,
    PairingHttpGateway,
    ReportHttpGateway,
    SubscriptionHttpGateway,
    UserHttpGateway,
} from '@chatic/http';

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
    | 'verifyOAuthCode'
    | 'delegateCloud'
    | 'exchangeToken'
>;
export type UserHttpDomainGateway = Pick<UserHttpGateway, 'list' | 'tryProfile'>;
export type CloudHttpDomainGateway = Pick<
    CloudHttpGateway,
    'get' | 'list' | 'update' | 'make' | 'release' | 'workspace' | 'verifyEmail'
>;
export type MiniAppHttpDomainGateway = Pick<MiniAppHttpGateway, 'list' | 'create' | 'update' | 'remove'>;
export type SubscriptionHttpDomainGateway = Pick<
    SubscriptionHttpGateway,
    | 'plans'
    | 'membership'
    | 'validateMembership'
    | 'markDrops'
    | 'adminMemberships'
    | 'updateMembershipByAdmin'
    | 'refundSubscriptionByAdmin'
    | 'adminClouds'
    | 'subscriptionCards'
    | 'issueBillingKey'
    | 'startSubscription'
    | 'changeSubscription'
    | 'cancelSubscription'
    | 'addCard'
    | 'setDefaultCard'
    | 'removeCard'
>;

export type ReportHttpDomainGateway = Pick<ReportHttpGateway, 'reportIssue' | 'uploadLogBatch'>;

export type PairingHttpDomainGateway = Pick<
    PairingHttpGateway,
    'request' | 'check' | 'approve' | 'deny' | 'claim' | 'revoke' | 'list'
>;

export interface HttpGatewayBundle {
    auth: AuthHttpDomainGateway;
    user: UserHttpDomainGateway;
    cloud: CloudHttpDomainGateway;
    miniApp: MiniAppHttpDomainGateway;
    subscription: SubscriptionHttpDomainGateway;
    report: ReportHttpDomainGateway;
    pairing: PairingHttpDomainGateway;
}
