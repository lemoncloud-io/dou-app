// Locally-remembered relay invite declines.
//
// TODO(backend): 2번 — ADR-0033 인터페이스 선반영. There is no reject API and no `rejected` invite
// state, so declining is a client-only event: we close the screen and remember the invite here, which
// is enough to keep it from ambushing the user every time the same deeplink is re-opened. When the
// API lands this module becomes a cache in front of it (or goes away).
//
// Stores the invite ID, never the code: the code is a credential (05-client-guide §B-1) and must not
// be written to storage, logs, or URLs other than the deeplink itself.
//
// The ids live in `usePreferenceStore` under `declinedInvites` (a 'local' JSON array, ring-capped
// there) rather than in this module's own localStorage calls — persisted client state goes through
// the one preference registry so the storage strategy is declared once.
//
// !WARN: `isInviteDeclined` currently has NO product caller — the decline is recorded but never
// read, so a re-opened deeplink still shows the accept screen. Wiring that read is the missing half
// of this stub, not something the storage move changed.

import { usePreferenceStore } from '../../../../stores/usePreferenceStore';

/** Remember that this invite was declined. No-op without an id (nothing safe to key on). */
export const recordDeclinedInvite = (inviteId: string | undefined): void => {
    if (!inviteId) return;
    usePreferenceStore.getState().markInviteDeclined(inviteId);
};

/** Whether this invite was declined on this device. */
export const isInviteDeclined = (inviteId: string | undefined): boolean =>
    !!inviteId && usePreferenceStore.getState().declinedInviteIds.includes(inviteId);
