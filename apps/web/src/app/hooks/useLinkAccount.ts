import { useMutation } from '@tanstack/react-query';

import {
    runtime,
    type AccountLinkMode,
    type PhoneCodeConfirmResult,
    type PhoneCodeSendOptions,
    type PhoneCodeVerifyResult,
    type SocialAccountTokens,
} from '@chatic/runtime';
import type { LinkSentView, LinkVerifiedView, LinkedView } from '@lemoncloud/chatic-backend-api';

export type { AccountLinkMode, SocialAccountTokens };

export type LinkAccountSendOptions = Omit<PhoneCodeSendOptions, 'mode'> & { mode: AccountLinkMode };

export const useLinkAccount = () => {
    const { auth } = runtime.data.useRuntimeRepositories();

    const sendMutation = useMutation({
        mutationFn: ({ phone, opts }: { phone: string; opts: LinkAccountSendOptions }) =>
            auth.sendPhoneCode(phone, opts),
    });

    const verifyMutation = useMutation({
        mutationFn: ({ phone, otp, mode, countryCode }: { phone: string; otp: string } & PhoneCodeProveArgs) =>
            auth.verifyPhoneCode(phone, otp, { mode, countryCode }),
    });

    const confirmMutation = useMutation({
        mutationFn: ({ phone, otp, countryCode }: { phone: string; otp: string } & PhoneCodeProveArgs) =>
            auth.confirmPhoneCode(phone, otp, { mode: 'link', countryCode }),
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
        confirm: (
            phone: string,
            otp: string,
            args: PhoneCodeProveArgs & { mode: 'link' }
        ): Promise<PhoneCodeConfirmResult> => confirmMutation.mutateAsync({ phone, otp, ...args }),
        verifySocial: (tokens: SocialAccountTokens): Promise<LinkVerifiedView> =>
            verifySocialMutation.mutateAsync(tokens),
        confirmSocial: (tokens: SocialAccountTokens): Promise<LinkedView> => confirmSocialMutation.mutateAsync(tokens),
        isSending: sendMutation.isPending,
        isVerifying: verifyMutation.isPending,
        isConfirming: confirmMutation.isPending,
        isLinkingSocial: verifySocialMutation.isPending || confirmSocialMutation.isPending,
    };
};

interface PhoneCodeProveArgs {
    mode: AccountLinkMode;
    countryCode?: string;
}
