import { usePreferenceStore } from '../../../stores/usePreferenceStore';

/**
 * Locally hidden sent-invite rows, stored as invite ids (`canceledInvites` in the preference
 * registry). Since ADR-0043 the record serves two narrow purposes:
 *
 * - **Rejected-row dismiss.** The server keeps a `rejected` invite forever (it never decays to
 *   `expired`, and `invite.cancel` does not overwrite a final mark), so once the sender re-invites
 *   the same person the old rejected row can only be cleared locally.
 * - **Legacy pre-API cancel stamps.** Cancels made while `invite.cancel` did not exist were
 *   recorded here without a server mutation; `useCanceledInviteReconcile` drains them by firing
 *   the real cancel and clearing each record once the server state is settled.
 *
 * The ids live in `usePreferenceStore` rather than in a store of their own with hand-rolled
 * localStorage: every persisted client setting goes through that one registry, so the storage
 * strategy is declared in one place instead of re-implemented per feature.
 */
export const useLocallyCanceledInvites = () => {
    const ids = usePreferenceStore(state => state.canceledInviteIds);
    const markCanceled = usePreferenceStore(state => state.markInviteCanceled);
    const clearCanceled = usePreferenceStore(state => state.clearInviteCanceled);

    const isCanceled = (inviteId: string): boolean => ids.includes(inviteId);

    return { canceledIds: ids, isCanceled, markCanceled, clearCanceled };
};
