import { config } from '@chatic/config';
import {
    type CloudHttpGateway,
    createCloudHttpGateway,
    createMiniAppHttpGateway,
    createOAuthHttpGateway,
    createPairingHttpGateway,
    createReportHttpGateway,
    createSubscriptionHttpGateway,
    createUserHttpGateway,
    type MiniAppHttpGateway,
    type OAuthHttpGateway,
    type PairingHttpGateway,
    type ReportHttpGateway,
    type SubscriptionHttpGateway,
    type UserHttpGateway,
} from '@chatic/http';

import { getHttpManager } from './factory';

let oauth: OAuthHttpGateway | null = null;
let cloud: CloudHttpGateway | null = null;
let miniApp: MiniAppHttpGateway | null = null;
let user: UserHttpGateway | null = null;
let subscription: SubscriptionHttpGateway | null = null;
let report: ReportHttpGateway | null = null;
let pairing: PairingHttpGateway | null = null;

export const oauthGateway = (): OAuthHttpGateway => {
    if (!oauth) oauth = createOAuthHttpGateway(getHttpManager());
    return oauth;
};

export const cloudGateway = (): CloudHttpGateway => {
    if (!cloud) cloud = createCloudHttpGateway(getHttpManager());
    return cloud;
};

export const miniAppGateway = (): MiniAppHttpGateway => {
    if (!miniApp) miniApp = createMiniAppHttpGateway(getHttpManager());
    return miniApp;
};

export const userGateway = (): UserHttpGateway => {
    if (!user) user = createUserHttpGateway(getHttpManager());
    return user;
};

export const subscriptionGateway = (): SubscriptionHttpGateway => {
    if (!subscription) subscription = createSubscriptionHttpGateway(getHttpManager());
    return subscription;
};

export const configuredArchiveEndpoint = (): string =>
    config.snapshot<string>('net.relay.backend')?.isOverridden
        ? ''
        : (config.get<string>('net.archive.endpoint') ?? '');

export const reportGateway = (): ReportHttpGateway => {
    if (!report) report = createReportHttpGateway(getHttpManager(), { archiveEndpoint: configuredArchiveEndpoint });
    return report;
};

export const pairingGateway = (): PairingHttpGateway => {
    if (!pairing) pairing = createPairingHttpGateway(getHttpManager());
    return pairing;
};

export const resetGateways = (): void => {
    oauth = null;
    cloud = null;
    miniApp = null;
    user = null;
    subscription = null;
    report = null;
    pairing = null;
};
