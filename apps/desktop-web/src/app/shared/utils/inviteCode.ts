import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

type InviteCodeRow = Pick<MyInviteView, 'id' | 'code'>;

export const composeInviteCode = (invite: InviteCodeRow): string | undefined =>
    invite.id && invite.code ? `invt:${invite.id}:${invite.code}` : undefined;

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
