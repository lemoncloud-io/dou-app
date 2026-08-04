import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type {
    AccountLinkMode,
    PhoneCodeConfirmResult,
    PhoneCodeSendOptions,
    PhoneCodeVerifyResult,
    SocialAccountTokens,
} from '@chatic/data';
import type { LinkSentView, LinkVerifiedView, LinkedView } from '@lemoncloud/chatic-backend-api';

export type { AccountLinkMode, SocialAccountTokens };

/** What a caller passes to `send`; the mode is required because the request declares intent. */
export type LinkAccountSendOptions = Omit<PhoneCodeSendOptions, 'mode'> & { mode: AccountLinkMode };

/**
 * The unified account-proof surface (`auth.link-account`), with the packet's four steps behind four
 * calls and the two modes carried as an argument.
 *
 * **The request declares intent, not the response.** `mode: 'login'` promotes a device user and comes
 * back with a `$token` that the caller must install (`applySessionToken`) before issuing or accepting
 * anything, or those calls return 403. `mode: 'link'` hangs one more credential on the session that is
 * already a main user and returns no token at all. Callers pick the mode from the session role
 * (`isGuest`), which is what keeps the two mismatch errors (main user + login = 400, device + link =
 * 403) out of reach.
 *
 * **`verify` never changes anything.** It exists so a linking screen can learn that confirming is
 * blocked (`linkable: false` + `reason`) instead of finding out from a 409/403. `login` gains nothing
 * from it — a valid code is all it reports — so the login flow confirms directly (ADR-0042 §4).
 *
 * There is no "extend the timer" step — the UI's extend action resends (ADR-0033 D9), which issues a
 * fresh code and a fresh `expiredAt` but does NOT reset the wrong-answer counter.
 *
 * Rate limits (60s cooldown, 10/day per number, 20/day per device, 5 wrong answers) all reject with
 * 429; a wrong code rejects with 403; on `mode: 'login'` a number that does not match the invite
 * rejects at SEND time with 400 and no code is dispatched. Read the status with `getSocketErrorCode`
 * rather than matching on the message.
 *
 * Phone numbers and codes stay in the request body — never log them or put them in a query key.
 */
export const useLinkAccount = () => {
    const { auth } = useRuntimeRepositories();

    // Step derivation (`send` vs `resend`) and the "omit an unset switch so the server default
    // survives" rule both live in the repository — the packet's shape is its business, not this hook's.
    const sendMutation = useMutation({
        mutationFn: ({ phone, opts }: { phone: string; opts: LinkAccountSendOptions }) =>
            auth.sendPhoneCode(phone, opts),
    });

    const verifyMutation = useMutation({
        mutationFn: ({ phone, otp, mode, countryCode }: { phone: string; otp: string } & PhoneCodeProveArgs) =>
            auth.verifyPhoneCode(phone, otp, { mode, countryCode }),
    });

    const confirmMutation = useMutation({
        mutationFn: ({ phone, otp, mode, countryCode }: { phone: string; otp: string } & PhoneCodeProveArgs) =>
            auth.confirmPhoneCode(phone, otp, { mode, countryCode }),
    });

    const verifySocialMutation = useMutation({
        mutationFn: (tokens: SocialAccountTokens) => auth.verifySocialAccount(tokens),
    });

    const confirmSocialMutation = useMutation({
        mutationFn: (tokens: SocialAccountTokens) => auth.confirmSocialAccount(tokens),
    });

    return {
        send: (phone: string, opts: LinkAccountSendOptions): Promise<LinkSentView> =>
            sendMutation.mutateAsync({ phone, opts }),
        verify: (phone: string, otp: string, args: PhoneCodeProveArgs): Promise<PhoneCodeVerifyResult> =>
            verifyMutation.mutateAsync({ phone, otp, ...args }),
        confirm: (phone: string, otp: string, args: PhoneCodeProveArgs): Promise<PhoneCodeConfirmResult> =>
            confirmMutation.mutateAsync({ phone, otp, ...args }),
        verifySocial: (tokens: SocialAccountTokens): Promise<LinkVerifiedView> =>
            verifySocialMutation.mutateAsync(tokens),
        confirmSocial: (tokens: SocialAccountTokens): Promise<LinkedView> => confirmSocialMutation.mutateAsync(tokens),
        isSending: sendMutation.isPending,
        isVerifying: verifyMutation.isPending,
        isConfirming: confirmMutation.isPending,
        isLinkingSocial: verifySocialMutation.isPending || confirmSocialMutation.isPending,
    };
};

/** Mode is required on every prove call; the country code must match the one used to send. */
interface PhoneCodeProveArgs {
    mode: AccountLinkMode;
    countryCode?: string;
}
