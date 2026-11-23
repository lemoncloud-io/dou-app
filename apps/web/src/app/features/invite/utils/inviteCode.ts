import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

export const composeInviteCode = (invite: Pick<MyInviteView, 'id' | 'code'>): string | undefined =>
    invite.id && invite.code ? `invt:${invite.id}:${invite.code}` : undefined;

export const resolveInviteCode = async (
    invites: Pick<MyInviteView, 'id' | 'code'>[],
    refetch: () => Promise<{ data?: Pick<MyInviteView, 'id' | 'code'>[] }>,
    inviteId: string
): Promise<string | undefined> => {
    const found = invites.find(item => item.id === inviteId);
    const code = found && composeInviteCode(found);
    if (code) return code;

    const refreshed = await refetch();
    const match = refreshed.data?.find(item => item.id === inviteId);
    return match ? composeInviteCode(match) : undefined;
};
