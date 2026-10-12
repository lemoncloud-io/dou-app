import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

type InviteCodeRow = Pick<MyInviteView, 'id' | 'code'>;

/**
 * Assemble the full invite code (`invt:<id>:<code>`) that `invite.cancel` /
 * `invite.reject` take (the backend `findRelayInviteByCode` parses exactly this
 * shape).
 *
 * The sender never persists a code — it is a credential — but `invite.list`
 * rows carry `id` and `code` because the inviter owns those invites, so the
 * full code is assembled here right before the call and lives only in that
 * call's scope. Never log or store the result.
 */
export const composeInviteCode = (invite: InviteCodeRow): string | undefined =>
    invite.id && invite.code ? `invt:${invite.id}:${invite.code}` : undefined;

/**
 * Resolve the code to act on an invite from the CURRENT list first — a
 * cache-first row carries no `code`, so `composeInviteCode` alone fails for any
 * row rendered before `invite.list` has returned. On a miss, re-ask the server
 * once and try again against the fresh response; still failing means there is
 * genuinely no code to act with (row not found, or a malformed server
 * response), and the caller treats it as a failure rather than retrying forever.
 */
export const resolveInviteCode = async (
    invites: InviteCodeRow[],
    refetch: () => Promise<{ data?: InviteCodeRow[] }>,
    inviteId: string
): Promise<string | undefined> => {
    const found = invites.find(item => item.id === inviteId);
    const code = found && composeInviteCode(found);
    if (code) return code;

    const refreshed = await refetch();
    const match = refreshed.data?.find(item => item.id === inviteId);
    return match ? composeInviteCode(match) : undefined;
};
