import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Assemble the full invite code (`invt:<id>:<code>`) that `invite.cancel`/`invite.reject` take
 * (backend `findRelayInviteByCode` parses exactly this shape).
 *
 * The sender never persists a code — it is a credential (feature doc design rules) — but
 * `invite.list` rows carry `id` and `code` because the inviter owns those invites, so the full
 * code is assembled here right before the call and lives only in that call's scope. Never log
 * or store the result.
 */
export const composeInviteCode = (invite: Pick<MyInviteView, 'id' | 'code'>): string | undefined =>
    invite.id && invite.code ? `invt:${invite.id}:${invite.code}` : undefined;
