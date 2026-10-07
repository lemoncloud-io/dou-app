import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { type CloudRowState, resolveCloudRowState } from '../../../utils';

export type CloudStatusTone = 'info' | 'warning' | 'danger';

export interface CloudStatusWord {
    /** i18n key under `mypage.cloudManage.status.`. */
    key: 'subscribed' | 'provisioning' | 'setupFailed' | 'ending' | 'expired' | 'restricted';
    tone: CloudStatusTone;
}

/**
 * The "cloud status" row on the cloud information screen — the row state in words.
 *
 * The design names two values, "subscribed" and "expired", because a cloud is normally one or the
 * other. The other row states are worded the same way the list badges word them, so a user who
 * came in from a badge reads the same thing on the detail. A hold the relay placed for a lapsed
 * subscription reads "expired"; a hold for a downgrade reads "restricted" — the fix for each is
 * different (resubscribe, or free a slot), so the word has to say which it is.
 */
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
