import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { type CloudRowState, resolveCloudRowState } from '../../../utils';

export type CloudStatusTone = 'info' | 'warning' | 'danger';

export interface CloudStatusWord {
    key: 'subscribed' | 'provisioning' | 'setupFailed' | 'ending' | 'expired' | 'restricted';
    tone: CloudStatusTone;
}

export const cloudStatusWord = (cloud: Pick<CloudView, 'status' | 'state$'>): CloudStatusWord => {
    const state: CloudRowState = resolveCloudRowState(cloud);
    switch (state) {
        case 'provisioning':
            return { key: 'provisioning', tone: 'info' };
        case 'setupFailed':
            return { key: 'setupFailed', tone: 'danger' };
        case 'dropScheduled':
            return { key: 'ending', tone: 'warning' };
        case 'restricted':
            return cloud.state$?.hold === 'expired'
                ? { key: 'expired', tone: 'danger' }
                : { key: 'restricted', tone: 'danger' };
        case 'released':
            return { key: 'expired', tone: 'danger' };
        default:
            return { key: 'subscribed', tone: 'info' };
    }
};
