import type { MyInviteStatus } from '@lemoncloud/chatic-backend-api';

/**
 * List-row status badge for a sent relay invite. `kind` is why the row looks the way it does (the
 * row's second line branches on it); `variant` maps 1:1 to `StatusBadge`'s tone, which declined
 * shares with expired; `labelKey` is the i18n key the row translates for display.
 *
 * `accepted` (and an unrecognized/empty state) resolve to `null` — an accepted invite stops being
 * an "invite row" and is expected to show up as a real channel once it syncs locally instead.
 */
export interface InviteRowBadge {
    kind: 'pending' | 'expired' | 'declined';
    variant: 'pending' | 'expired';
    labelKey: string;
}

/**
 * The state value the backend is expected to introduce for 백엔드 요청 목록 #2. It is not part of
 * `MyInviteStatus` yet (`pending | accepted | expired`), hence the widened comparison: the resolvers
 * below can already recognize it, so adopting it is a flag flip rather than a code change.
 */
const REJECTED_STATE = 'rejected';

const isRejected = (state: MyInviteStatus | undefined, rejectedStateSupported: boolean): boolean =>
    rejectedStateSupported && (state as string | undefined) === REJECTED_STATE;

/**
 * Row badge for a sent invite. Declined reads as a distinct "초대 거절" badge only when the caller
 * says the backend reports that state (`INVITE_REJECTED_STATE_SUPPORTED`); until then a declined
 * invite is indistinguishable from an expired one, so every state besides `pending`/`accepted`
 * shares the expired badge. The flag is a parameter rather than an import so this stays pure and
 * both branches are testable — same shape as `resolveExpiredReinviteDescriptionKey` below.
 */
export const resolveInviteRowBadge = (
    state: MyInviteStatus | undefined,
    rejectedStateSupported = false
): InviteRowBadge | null => {
    if (state === 'pending') return { kind: 'pending', variant: 'pending', labelKey: 'contactInvite.badge.pending' };
    if (!state || state === 'accepted') return null;
    // Declined keeps the `expired` tone — it is the same "this invite is spent" signal, and the
    // design gives it no separate color; only the label and the row's second line differ.
    if (isRejected(state, rejectedStateSupported)) {
        return { kind: 'declined', variant: 'expired', labelKey: 'contactInvite.badge.declined' };
    }
    return { kind: 'expired', variant: 'expired', labelKey: 'contactInvite.badge.expired' };
};

/** Which copy the re-invite dialog (ContactInvitePage) shows when the recipient was already invited. */
export type ReinviteVariant = 'pending' | 'expired' | 'declined';

/**
 * Resolve the re-invite dialog variant from the matched invite's current state (or `undefined`
 * when it fell out of the `invite.list` page window — see the sender doc's "리스크와 미지수").
 * `declined` is unreachable until `INVITE_REJECTED_STATE_SUPPORTED` flips, but the dialog already
 * renders its copy (see ReinviteDialog), so adopting a real `rejected` state needs no UI change.
 */
export const resolveReinviteVariant = (
    state: MyInviteStatus | undefined,
    rejectedStateSupported = false
): ReinviteVariant => {
    if (state === 'pending') return 'pending';
    if (isRejected(state, rejectedStateSupported)) return 'declined';
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
