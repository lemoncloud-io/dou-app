/** The invite-accept pipeline step that was in flight when an error was thrown. */
export type InviteAcceptStep = 'login-invite' | 'cache-cloud' | 'enter-cloud' | 'enter-site' | 'enter-channel';

/**
 * Maps a failure (the step it happened in + the thrown error) to a specific `inviteAccept.*` i18n key
 * so the toast and error panel can name the actual cause instead of a generic "failed".
 *
 * Ordering matters: transport-shape errors (timeout/network) are checked first since they can occur in
 * any step. Server errors arrive as HTTP-200 bodies like `"400 INVALID - ..."` (see throwIfApiError),
 * so we match by HTTP-code substring — the same convention used by ErrorFallback. `delegatorId` is not
 * handled here: it is branched to the missing-delegator panel before this helper runs.
 */
export const resolveInviteErrorKey = (step: InviteAcceptStep, err: Error): string => {
    const message = err.message;

    if (message.startsWith('TIMEOUT:')) return 'inviteAccept.timeout';
    if (message.includes('Network Error') || message.includes('ERR_NETWORK')) return 'inviteAccept.networkError';

    if (step === 'login-invite') {
        // The invite itself is bad: expired, revoked, or a malformed code.
        if (message.includes('400') || message.includes('404')) return 'inviteAccept.expired';
        // Authentication/authorization rejected the invite login.
        if (message.includes('401') || message.includes('403')) return 'inviteAccept.authVerifyFailed';
        return 'inviteAccept.failed';
    }

    // Login succeeded but a later token/entry step failed — the user is registered but couldn't enter.
    return 'inviteAccept.enterFailed';
};
