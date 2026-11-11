import type { HttpGatewayBundle } from '../gateways';
import type { IAuthHttpDataSource } from './AuthHttpDataSource';
import { AuthHttpDataSource } from './AuthHttpDataSource';
import type { IUserHttpDataSource } from './UserHttpDataSource';
import { UserHttpDataSource } from './UserHttpDataSource';
import type { ICloudHttpDataSource } from './CloudHttpDataSource';
import { CloudHttpDataSource } from './CloudHttpDataSource';
import type { ISubscriptionHttpDataSource } from './SubscriptionHttpDataSource';
import { SubscriptionHttpDataSource } from './SubscriptionHttpDataSource';
import type { IReportHttpDataSource } from './ReportHttpDataSource';
import { ReportHttpDataSource } from './ReportHttpDataSource';
import type { IPairingHttpDataSource } from './PairingHttpDataSource';
import { PairingHttpDataSource } from './PairingHttpDataSource';

export * from './AuthHttpDataSource';
export * from './UserHttpDataSource';
export * from './CloudHttpDataSource';
export * from './SubscriptionHttpDataSource';
export * from './ReportHttpDataSource';
export * from './PairingHttpDataSource';

export interface HttpDataSources {
    auth: IAuthHttpDataSource;
    user: IUserHttpDataSource;
    cloud: ICloudHttpDataSource;
    subscription: ISubscriptionHttpDataSource;
    report: IReportHttpDataSource;
    pairing: IPairingHttpDataSource;
}

/** Gathers HttpDataSource construction in one place — symmetric with the socket axis's `createSocketDataSources`. */
export const createHttpDataSources = ({ gateways }: { gateways: HttpGatewayBundle }): HttpDataSources => ({
    auth: new AuthHttpDataSource(gateways.auth),
    user: new UserHttpDataSource(gateways.user),
    cloud: new CloudHttpDataSource(gateways.cloud),
    subscription: new SubscriptionHttpDataSource(gateways.subscription),
    report: new ReportHttpDataSource(gateways.report),
    pairing: new PairingHttpDataSource(gateways.pairing),
});
