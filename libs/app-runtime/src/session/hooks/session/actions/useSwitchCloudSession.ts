import { logger } from '@chatic/bridges';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startPerfTrace } from '@chatic/perf';

import { SDK_REFRESH_CYCLE_MS, getSocketManager, slotKeyOf } from '@chatic/transport';
import {
    credentialRenewers,
    reauthenticateActiveSocket,
    createReauthDelegate,
    cloudSession,
    INVITE_LOGIN_UNKNOWN,
    forgetInviteLogin,
    readInviteLogin,
    tokensFromInviteLogin,
} from '@chatic/auth';

import { SWITCH_CLOUD_MUTATION_KEY } from '../../mutationKeys';
import type { InviteLogin } from '@chatic/auth';

/**
 * A switch onto a live background slot commits that slot's tokens as they are, without re-issuing —
 * including ones that ran low while nothing was looking (a laptop asleep, say). The credential guard
 * would renew them on its next tick, which can be minutes away; the user just walked into this
 * cloud, so renew now. Renewal re-issues and re-registers the socket in one step.
 */
/**
 * A switch that commits tokens the server already issued (an invite login's) onto a live background
 * slot has to hand them to that slot's socket. The slot registered with the tokens it was booted on,
 * and a cloud slot is never re-authenticated on its own — its binding carries no identity token — so
 * without this the socket would go on as the user it booted as while the store names another.
 */
const reregisterSlot = async (cloudId: string): Promise<void> => {
    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    } catch (error) {
        // The store already holds the issued tokens; the socket registers from it on its next
        // handshake anyway, so the switch does not fail for this half.
        logger.warn('SOCKET', '[useSwitchCloudSession] slot re-registration failed', { error, data: { cloudId } });
    }
};

interface SwitchCloudArgs {
    cloudId: string;
    /**
     * The invite login this entry follows. Its answer is entered with as it is, instead of a
     * `delegate-cloud` re-issue — see `SwitchCloudOptions.issuedTokens` for why.
     */
    inviteLogin?: InviteLogin;
}

const renewIfLapsing = (cloudId: string): void => {
    const renewer = credentialRenewers.forSlot(slotKeyOf(cloudId));
    const left = renewer.timeToExpiry();
    if (left != null && left <= SDK_REFRESH_CYCLE_MS) void renewer.renew();
};

/**
 * Switches the active cloud session through session services.
 *
 * The `cloud_switch` trace is taken here rather than inside `CloudSession.switchTo`. The service function has a second caller — cloud-refresh recovery re-exchanges a
 * token through it after re-minting the relay session — and that path is rare and slow, so
 * measuring the service would let recovery masquerade as a user-initiated switch and drag the
 * tail. Every caller of this hook is a real selection: the cloud sheet, search navigation, an
 * invite entry, a push deep link.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: async ({ cloudId, inviteLogin }: SwitchCloudArgs) => {
            // Asked at the moment of the switch: a background slot for the target may have bound or
            // gone since render, and whether one is up decides which tokens the switch may commit.
            const hasLiveSlot = getSocketManager()
                .getSlotKeys()
                .some(key => key === cloudId);
            // A handle this runtime does not hold is refused, not entered the ordinary way: a re-issue
            // answers for the relay user as it is now, which after a sign-in is not the invitee the
            // invite was accepted as. Only an answer that is held but cannot be entered with falls back.
            const answer = inviteLogin ? readInviteLogin(inviteLogin.handle) : null;
            if (inviteLogin && !answer) {
                throw Object.assign(new Error('The invite login this switch names is not held by the runtime'), {
                    code: INVITE_LOGIN_UNKNOWN,
                });
            }
            const issuedTokens = answer
                ? (tokensFromInviteLogin(cloudId, {
                      cloudToken: answer,
                      backend: inviteLogin?.backend,
                      wss: inviteLogin?.wss,
                  }) ?? undefined)
                : undefined;
            if (inviteLogin && !issuedTokens) {
                logger.warn('SESSION', '[useSwitchCloudSession] invite login answer not enterable; re-issuing', {
                    data: { cloudId },
                });
            }
            await cloudSession.switchTo(cloudId, { hasLiveSlot, issuedTokens });
            // In: the answer is the session's now. Forgotten only here, so a switch that failed is
            // retried with the same handle and enters with the same answer.
            if (inviteLogin) forgetInviteLogin(inviteLogin.handle);
            if (hasLiveSlot && issuedTokens) await reregisterSlot(cloudId);
            else if (hasLiveSlot) renewIfLapsing(cloudId);
        },
    });

    // Keyed on the stable `mutateAsync` (react-query memoizes it) rather than the mutation object,
    // which is a fresh reference every render — otherwise this callback's identity churns and
    // downstream effect deps re-run on every render. Same fix `useSiteSwitch` already carries.
    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            async (cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void> => {
                const trace = startPerfTrace('cloud_switch');
                try {
                    // Resolves with nothing: what the switch committed is the session's, and the session
                    // readers show it. Its snapshot carries the cloud's token, which a screen must not hold.
                    await mutateAsync({ cloudId, inviteLogin: options?.inviteLogin });
                    trace.putAttribute('outcome', 'ok');
                    trace.stop();
                } catch (error) {
                    // Recorded rather than skipped: a switch slow enough to fail belongs in the
                    // distribution, and dropping failures biases it optimistic.
                    trace.putAttribute('outcome', 'error');
                    trace.stop();
                    throw error;
                }
            },
            [mutateAsync]
        ),
        isPending: mutation.isPending,
    };
};
