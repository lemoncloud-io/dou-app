import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

export interface InviteLogin {
    handle: string;
    cloudId: string | null;
    backend?: string;
    wss?: string;
}

export const INVITE_LOGIN_UNKNOWN = 'INVITE_LOGIN_UNKNOWN';

const KEPT_AT_MOST = 4;

const kept = new Map<string, UserTokenView>();
let issued = 0;

export const keepInviteLogin = (answer: UserTokenView): InviteLogin => {
    issued += 1;
    const handle = `invite-login-${issued}-${Math.random().toString(36).slice(2, 10)}`;
    kept.set(handle, answer);
    while (kept.size > KEPT_AT_MOST) kept.delete(kept.keys().next().value as string);
    return { handle, cloudId: answer.cloudId ?? null };
};

export const readInviteLogin = (handle: string): UserTokenView | null => kept.get(handle) ?? null;

export const forgetInviteLogin = (handle: string): void => {
    kept.delete(handle);
};

export const resetInviteLogins = (): void => {
    kept.clear();
    issued = 0;
};
