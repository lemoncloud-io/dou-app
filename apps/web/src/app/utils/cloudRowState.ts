import type { CloudView } from '@lemoncloud/chatic-backend-api';

/**
 * What a cloud row says about itself — the design's four badges plus the two states that carry no
 * badge. Shared by the cloud switcher (home) and cloud management (mypage) so a cloud never reads
 * one way in the sheet and another way on the management screen.
 *
 * - `provisioning` — the relay has the record but the slot is not deployed yet (`init` / `reserved`).
 * - `setupFailed` — provisioning errored; the only fix is releasing it and adding one again.
 * - `dropScheduled` — the user chose to give this cloud up at the next renewal. It is still usable
 *   until then, so it is enterable.
 * - `restricted` — the relay holds it (`suspended`): over the allowance after a downgrade, or the
 *   subscription lapsed. Not enterable; cloud management explains why.
 * - `released` — gone (`expired`). The catalog hides these by default, so a row rarely sees one.
 * - `ready` — active, nothing to say.
 */
export type CloudRowState = 'provisioning' | 'setupFailed' | 'dropScheduled' | 'restricted' | 'released' | 'ready';

export type CloudRowInput = Pick<CloudView, 'status' | 'state$'>;

/**
 * Derives the row state from the relay's `status` and the `plan` axis.
 *
 * `status` already folds the other axes in priority order (released → held → error → provision),
 * so it is read as the truth for everything except the drop mark: `state$.plan` is a plan for the
 * next renewal, not a present state, so the relay keeps it out of `status` on purpose. It only
 * matters on a cloud that is otherwise active — a held cloud is already restricted, and that
 * outranks a mark it may also carry.
 */
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

/** Whether the switcher may enter the cloud. Only a live, deployed cloud has a session to switch to. */
export const isCloudEnterable = (state: CloudRowState): boolean => state === 'ready' || state === 'dropScheduled';

/**
 * Whether the row needs the "check the cloud's information" caption and the chevron into cloud
 * management — every state that has something to explain, which is every badge state except
 * provisioning (its badge already says what is going on and waiting is the only action).
 */
export const needsCloudAttention = (state: CloudRowState): boolean =>
    state === 'setupFailed' || state === 'dropScheduled' || state === 'restricted';
