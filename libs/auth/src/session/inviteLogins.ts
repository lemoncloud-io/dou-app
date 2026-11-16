import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * An invite login's answer as a screen holds it: a handle, the cloud the answer names, and — added by
 * the screen, which has the invite — where that cloud lives. The answer itself is the invitee's own
 * cloud token, so it stays here, with the session; `switchCloud(cloudId, { inviteLogin })` enters with
 * it, and `forgetInviteLogin` drops one the screen will not enter with.
 */
export interface InviteLogin {
    handle: string;
    /** The cloud the answer is for — its AWS account-no, the only id an invite answer carries. */
    cloudId: string | null;
    /** The cloud's REST endpoint — the one the invite login was sent to. */
    backend?: string;
    /** The cloud's socket endpoint, from the invite. */
    wss?: string;
}

/** The `code` a cloud switch throws with for a handle this runtime does not hold (never given, or forgotten). */
export const INVITE_LOGIN_UNKNOWN = 'INVITE_LOGIN_UNKNOWN';

/**
 * How many answers wait at most. A flow enters with its one within seconds or forgets it; the cap only
 * bounds what a flow that did neither leaves behind.
 */
const KEPT_AT_MOST = 4;

const kept = new Map<string, UserTokenView>();
let issued = 0;

/**
 * Keeps an invite login's answer and hands back the handle for it. The handle carries a random part,
 * so a stale one from an earlier flow cannot name a later flow's answer.
 */
export const keepInviteLogin = (answer: UserTokenView): InviteLogin => {
    issued += 1;
    const handle = `invite-login-${issued}-${Math.random().toString(36).slice(2, 10)}`;
    kept.set(handle, answer);
    // The oldest go first.
    while (kept.size > KEPT_AT_MOST) kept.delete(kept.keys().next().value as string);
    return { handle, cloudId: answer.cloudId ?? null };
};

/**
 * The answer `handle` was given for, or null for one this runtime does not hold. Reading keeps it: a
 * switch that fails on the network is retried with the same handle, and must enter with the same answer.
 */
export const readInviteLogin = (handle: string): UserTokenView | null => kept.get(handle) ?? null;

/**
 * Forgets an answer — the cloud switch does once it entered with it, and a screen does for one it will
 * not enter with: the owner opening their own invite, an invite without a cloud, a flow that failed.
 */
export const forgetInviteLogin = (handle: string): void => {
    kept.delete(handle);
};

/** Test seam: the kept answers are a process singleton. */
export const resetInviteLogins = (): void => {
    kept.clear();
    issued = 0;
};
