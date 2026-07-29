import { useMutation } from '@tanstack/react-query';

import { useRuntimeGateways } from '@chatic/app-runtime';
import type { UserTokenView, VerifyHashAliasView } from '@lemoncloud/chatic-backend-api';

/** Send-side switches. `resend` picks the step; the rest are dev delivery controls. */
export interface VerifyHashAliasSendOptions {
    /** Invite code, when the verification happens inside an accept flow. */
    code?: string;
    /** Ask for a new code instead of the first one. */
    resend?: boolean;
    /** Run the flow without actually delivering the code. Caps and counters still apply. */
    dryRun?: boolean;
    /** Deliver over SMS (server default: true). */
    sms?: boolean;
    /** Deliver over Slack (server default: true) — how a dev build receives codes. */
    slack?: boolean;
}

/** What `step=send`/`step=resend` answers with. `expiredAt` (epoch ms) drives the countdown. */
export type VerifyHashAliasSendResult = Pick<VerifyHashAliasView, 'sent' | 'expiredAt'>;

/** What `step=check` answers with. A non-empty `$token` means the session changed. */
export interface VerifyHashAliasCheckResult {
    attached?: boolean;
    /** New session, present only when the check promoted a device user to a main user. */
    $token?: UserTokenView;
}

/**
 * Phone verification over `auth.verify-hash-alias`, with the three steps hidden behind two calls.
 *
 * A successful `check` is a LOGIN: the response's `$token` is a new session that the caller must
 * push into the sockets before issuing or accepting anything, or those calls come back 403. The
 * server does not interpret `$token`; refreshing the connection identity is the client's job.
 * An empty `$token` means the number was merely linked and the session is unchanged.
 *
 * There is no "extend the timer" step — the UI's extend action resends (ADR-0033 D9), which issues
 * a fresh code and a fresh `expiredAt` but does NOT reset the wrong-answer counter.
 *
 * Rate limits (60s cooldown, 10/day per number, 20/day per device, 5 wrong answers) all reject with
 * 429; a wrong code rejects with 403; a number that does not match the invite rejects at SEND time
 * with 400. Read the status with `getSocketErrorCode` rather than matching on the message.
 *
 * Phone numbers and codes stay in the request body — never log them or put them in a query key.
 */
export const useVerifyHashAlias = () => {
    const { auth } = useRuntimeGateways();

    const sendMutation = useMutation({
        mutationFn: ({ phone, opts }: { phone: string; opts?: VerifyHashAliasSendOptions }) => {
            const { resend, ...switches } = opts ?? {};
            // Omit unset switches entirely so the server's defaults survive (a literal `false` would
            // turn a channel off).
            return auth.verifyHashAlias<VerifyHashAliasSendResult>({
                kind: 'phone',
                step: resend ? 'resend' : 'send',
                phone,
                ...switches,
            });
        },
    });

    const checkMutation = useMutation({
        mutationFn: ({ phone, otp, code }: { phone: string; otp: string; code?: string }) =>
            auth.verifyHashAlias<VerifyHashAliasCheckResult>({ kind: 'phone', step: 'check', phone, otp, code }),
    });

    return {
        send: (phone: string, opts?: VerifyHashAliasSendOptions) => sendMutation.mutateAsync({ phone, opts }),
        check: (phone: string, otp: string, opts?: { code?: string }) =>
            checkMutation.mutateAsync({ phone, otp, code: opts?.code }),
        isSending: sendMutation.isPending,
        isChecking: checkMutation.isPending,
    };
};
