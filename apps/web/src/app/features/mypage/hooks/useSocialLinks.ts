import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { useLinkAccount, useLinkedAccounts, type SocialAccountTokens } from '../../../hooks';
import { getSocketErrorCode, toError } from '../../../utils/errors';

export type SocialProvider = 'google' | 'apple';

export const useSocialLinks = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { verifySocial, confirmSocial, isLinkingSocial } = useLinkAccount();
    const linked = useLinkedAccounts();

    const isLinked = useCallback(
        (provider: SocialProvider) => linked.social === 'linked' && linked.socialProvider === provider,
        [linked.social, linked.socialProvider]
    );

    const linkProvider = useCallback(
        async (provider: SocialProvider) => {
            const providerSignIn = runtime.signIn.providerSignIn;
            if (!providerSignIn) {
                toast({ title: t('mypage.accountInfo.social.mobileOnly') });
                return;
            }

            try {
                const result = await providerSignIn.credential(provider);

                if (!result) return;

                const tokens = { ...(result as Record<string, unknown>), provider } as SocialAccountTokens;

                const check = await verifySocial(tokens);
                if (!check.linkable) {
                    const reasonKey =
                        check.reason === 'type-linked'
                            ? 'mypage.accountInfo.social.typeAlreadyLinked'
                            : 'mypage.accountInfo.social.alreadyLinkedElsewhere';
                    toast({ title: t(reasonKey), variant: 'destructive' });
                    return;
                }

                await confirmSocial(tokens);
                toast({ title: t('mypage.accountInfo.social.linkSuccess') });
            } catch (e) {
                logger.error('AUTH', '[useSocialLinks] link-account (social) failed', { error: toError(e) });
                const code = getSocketErrorCode(e);
                const messageKey =
                    code === 409
                        ? 'mypage.accountInfo.social.alreadyLinkedElsewhere'
                        : code === 403
                          ? 'mypage.accountInfo.social.typeAlreadyLinked'
                          : 'mypage.accountInfo.social.linkFailed';
                toast({ title: t(messageKey), variant: 'destructive' });
            }
        },
        [confirmSocial, t, toast, verifySocial]
    );

    return {
        isLinked,
        linkProvider,
        isLinking: isLinkingSocial,
        socialState: linked.social,
    };
};
