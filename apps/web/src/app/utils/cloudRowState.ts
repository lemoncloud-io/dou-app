import type { CloudView } from '@lemoncloud/chatic-backend-api';

export type CloudRowState = 'provisioning' | 'setupFailed' | 'dropScheduled' | 'restricted' | 'released' | 'ready';

export type CloudRowInput = Pick<CloudView, 'status' | 'state$'>;

export const canRetryCloudSetup = (cloud: CloudRowInput & Pick<CloudView, 'slotId' | 'accountNo'>): boolean =>
    resolveCloudRowState(cloud) === 'setupFailed' && !cloud.slotId && !cloud.accountNo;

export const resolveCloudRowState = (cloud: CloudRowInput): CloudRowState => {
    switch (cloud.status) {
        case 'init':
        case 'reserved':
            return 'provisioning';
        case 'error':
            return 'setupFailed';
        case 'suspended':
            return 'restricted';
        case 'expired':
            return 'released';
        default:
            return cloud.state$?.plan === 'drop' ? 'dropScheduled' : 'ready';
    }
};

export const isCloudEnterable = (state: CloudRowState): boolean => state === 'ready' || state === 'dropScheduled';

export const needsCloudAttention = (state: CloudRowState): boolean =>
    state === 'setupFailed' || state === 'dropScheduled' || state === 'restricted';
