import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

/**
 * List-row status badge for a sent relay invite. `variant` maps 1:1 to `StatusBadge`'s tone;
 * `labelKey` is the i18n key the row translates for display.
 *
 * `accepted` (and an unrecognized/empty state) resolve to `null` — an accepted invite stops being
 * an "invite row" and is expected to show up as a real channel once it syncs locally instead.
 */
export interface InviteRowBadge {
    variant: 'pending' | 'expired';
    labelKey: string;
}

/**
 * The backend has no `rejected`/declined state (ADR-0033 — 백엔드 요청 목록 #2), so a declined
 * invite is indistinguishable from an expired one today. Any state besides `pending`/`accepted`
 * — including a future `rejected` value, should the backend add one — reads as "expired" here.
 * This is the single spot to revisit once `INVITE_REJECTED_STATE_SUPPORTED` flips.
 */
export const resolveInviteRowBadge = (state: MyInviteStatus | undefined): InviteRowBadge | null => {
    if (state === 'pending') return { variant: 'pending', labelKey: 'contactInvite.badge.pending' };
    if (!state || state === 'accepted') return null;
    return { variant: 'expired', labelKey: 'contactInvite.badge.expired' };
};

/** Which copy the re-invite dialog (ContactInvitePage) shows when the recipient was already invited. */
export type ReinviteVariant = 'pending' | 'expired' | 'declined';

/**
 * Resolve the re-invite dialog variant from the matched invite's current state (or `undefined`
 * when it fell out of the `invite.list` page window — see the sender doc's "리스크와 미지수").
 * `declined` is never returned today (no server state maps to it) but the dialog still renders
 * its copy — see ReinviteDialog — so wiring a real `rejected` state later needs no UI change.
 */
export const resolveReinviteVariant = (state: MyInviteStatus | undefined): ReinviteVariant => {
    if (state === 'pending') return 'pending';
    return 'expired';
};

/**
 * Which i18n key the re-invite dialog's `expired` description uses (ADR-0033 요청 3번 — 로드맵
 * `INVITE_AUTO_REVOKE_ON_REISSUE_SUPPORTED`). Reissuing does not revoke the prior pending code
 * server-side today, so the copy must not claim it does; once it does, the caller flips the flag
 * and this starts returning the auto-revoke key with no other code change.
 */
export const resolveExpiredReinviteDescriptionKey = (autoRevokeSupported: boolean): string =>
    autoRevokeSupported
        ? 'contactInvite.reinvite.expired.descriptionAutoRevoke'
        : 'contactInvite.reinvite.expired.description';

/**
 * Which i18n key the waiting screen's cancel-confirm dialog uses (ADR-0033 요청 1번 — 로드맵
 * `INVITE_CANCEL_API_SUPPORTED`). Without a real `invite.cancel` API, confirming only hides the
 * invite on this device (`useLocallyCanceledInvites`) — the recipient could, in principle, still
 * accept it — so the copy says so instead of claiming the invite itself is invalidated.
 */
export const resolveCancelDialogDescriptionKey = (cancelApiSupported: boolean): string =>
    cancelApiSupported ? 'inviteWaiting.cancelDialog.description' : 'inviteWaiting.cancelDialog.descriptionStub';
