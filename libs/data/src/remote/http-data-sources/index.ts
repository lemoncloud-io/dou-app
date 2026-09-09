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

export * from './AuthHttpDataSource';
export * from './UserHttpDataSource';
export * from './CloudHttpDataSource';
export * from './SubscriptionHttpDataSource';
export * from './ReportHttpDataSource';

export interface HttpDataSources {
    auth: IAuthHttpDataSource;
    user: IUserHttpDataSource;
    cloud: ICloudHttpDataSource;
    subscription: ISubscriptionHttpDataSource;
    report: IReportHttpDataSource;
}

/** HttpDataSource 생성 위치를 한 곳으로 모읍니다 — 소켓 축 `createSocketDataSources`와 대칭. */
export const createHttpDataSources = ({ gateways }: { gateways: HttpGatewayBundle }): HttpDataSources => ({
    auth: new AuthHttpDataSource(gateways.auth),
    user: new UserHttpDataSource(gateways.user),
    cloud: new CloudHttpDataSource(gateways.cloud),
    subscription: new SubscriptionHttpDataSource(gateways.subscription),
    report: new ReportHttpDataSource(gateways.report),
});
