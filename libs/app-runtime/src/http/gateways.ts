import {
    type CloudHttpGateway,
    createCloudHttpGateway,
    createOAuthHttpGateway,
    createReportHttpGateway,
    createSubscriptionHttpGateway,
    createUserHttpGateway,
    type OAuthHttpGateway,
    type ReportHttpGateway,
    type SubscriptionHttpGateway,
    type UserHttpGateway,
} from '@chatic/http';

import { getHttpManager } from './factory';

/**
 * The one set of gateway instances for the whole runtime.
 *
 * Before this file there were three: `data/factories/httpFactory` built a fresh bundle per
 * `DataManager` init, and the REST hooks and `session/auth` each memoized their own
 * subscription/cloud/user/oauth trio — so the cloud and user gateways existed in two or three copies
 * at once. They are stateless wrappers over the shared `HttpManager`, so the copies were harmless but
 * pointless, and each new consumer meant another private cache to remember to reset in tests.
 *
 * Built lazily per accessor (not at module load) so import order never matters, matching
 * `getHttpManager` itself.
 */
let oauth: OAuthHttpGateway | null = null;
let cloud: CloudHttpGateway | null = null;
let user: UserHttpGateway | null = null;
let subscription: SubscriptionHttpGateway | null = null;
let report: ReportHttpGateway | null = null;

export const oauthGateway = (): OAuthHttpGateway => {
    if (!oauth) oauth = createOAuthHttpGateway(getHttpManager());
    return oauth;
};

export const cloudGateway = (): CloudHttpGateway => {
    if (!cloud) cloud = createCloudHttpGateway(getHttpManager());
    return cloud;
};

export const userGateway = (): UserHttpGateway => {
    if (!user) user = createUserHttpGateway(getHttpManager());
    return user;
};

export const subscriptionGateway = (): SubscriptionHttpGateway => {
    if (!subscription) subscription = createSubscriptionHttpGateway(getHttpManager());
    return subscription;
};

export const reportGateway = (): ReportHttpGateway => {
    if (!report) report = createReportHttpGateway(getHttpManager());
    return report;
};

/** Test seam — drops every cached gateway. Pair with `resetHttpManager` when the client itself must
 * be rebuilt: a cached gateway holds the OLD client, so resetting only one of the two leaves stale
 * wiring behind. */
export const resetGateways = (): void => {
    oauth = null;
    cloud = null;
    user = null;
    subscription = null;
    report = null;
};
