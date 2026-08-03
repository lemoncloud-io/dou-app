import { usePreferenceStore } from '../../../stores/usePreferenceStore';

/**
 * Local-only "canceled" stamp for sent invites (ADR-0033 — the backend has no `invite.cancel` API
 * yet, 백엔드 요청 목록 #1). Confirming cancel on the waiting screen does not call any server
 * mutation; it stamps the invite id so this device stops showing it as pending/expired (list rows,
 * the waiting screen). The invite itself is untouched server-side — the recipient can, in principle,
 * still accept it. See `INVITE_CANCEL_API_SUPPORTED` in `../flags` and the sender doc's
 * "리스크와 미지수" for the known gap.
 *
 * The ids live in `usePreferenceStore` under `canceledInvites` rather than in a store of their own
 * with hand-rolled localStorage: every persisted client setting goes through that one registry, so
 * the storage strategy is declared in one place instead of re-implemented per feature.
 */
export const useLocallyCanceledInvites = () => {
    const ids = usePreferenceStore(state => state.canceledInviteIds);
    const markCanceled = usePreferenceStore(state => state.markInviteCanceled);

    const isCanceled = (inviteId: string): boolean => ids.includes(inviteId);

    return { isCanceled, markCanceled };
};
