import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';

export interface AddCloudFlowResult {
    /**
     * Entry point for every "add a cloud" affordance. The button stays visible whatever the quota
     * says — matching how "＋ 플레이스 추가" behaves — and the reason for a refusal is surfaced by
     * the flow itself.
     */
    requestAddCloud: () => void;
}

/**
 * Raises a request for the subscribe-a-cloud flow.
 *
 * The flow (quota check → plan picker or email verify → provision) lives in
 * `features/subscription`, which home cannot import (ADR-0046 §3). Home only signals intent; the
 * private router mounts `AddCloudFlowHost` to answer it. That is also why nothing is returned to
 * render here any more — the host owns the dialogs.
 */
export const useAddCloudFlow = (): AddCloudFlowResult => ({
    requestAddCloud: useAddCloudRequest(s => s.requestAddCloud),
});
