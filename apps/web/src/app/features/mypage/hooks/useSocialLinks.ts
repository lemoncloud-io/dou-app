import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { isNative, logger } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { useLinkAccount, useLinkedAccounts, type SocialAccountTokens } from '../../../hooks';
import { getSocketErrorCode, toError } from '../../../utils/errors';

/** Providers this screen offers. Apple is further gated to iOS by the caller (mirrors LoginPage). */
export type SocialProvider = 'google' | 'apple';

/**
 * Social-link status + link orchestration for the mypage account screen.
 *
 * **Linked state now comes from the server.** `link$.social` on the user record says whether this user
 * has a social credential and which provider it is, replacing the uid-scoped localStorage guess this
 * hook used to keep (ADR-0042 §7). That guess could not see a link made on another device and read as
 * "not linked" after a cache wipe; the server slot has neither problem.
 *
 * The state is tri-valued on purpose. `'unknown'` means the profile has not landed or the server never
 * built the slot, and the section must stay silent then rather than claim either answer — an
 * account-security control that can lie is worse than one that admits it does not know.
 *
 * Linking runs `verify` before `confirm`: verify is the only step that reports `linkable: false` with a
 * reason, while confirm answers the same situation with a 409/403. Neither ever changes the session —
 * this is a link, not a login (guide §알아 둘 제약).
 */
export const useSocialLinks = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { verifySocial, confirmSocial, isLinkingSocial } = useLinkAccount();
    const linked = useLinkedAccounts();

    /**
     * Whether THIS provider is the linked one. The server keeps a single social slot, so a provider
     * other than the recorded one reads as unlinked — which is also what the server enforces
     * (`type-linked`).
     */
    const isLinked = useCallback(
        (provider: SocialProvider) => linked.social === 'linked' && linked.socialProvider === provider,
        [linked.social, linked.socialProvider]
    );

    const linkProvider = useCallback(
        async (provider: SocialProvider) => {
            if (!isNative()) {
                // No native bridge means no way to obtain the provider's raw token (the existing
                // browser OAuth relay only yields our own session token, not a native id/identity
                // token — see social-links.md "비네이티브 OAuth relay 재사용 조사").
                toast({ title: t('mypage.accountInfo.social.mobileOnly') });
                return;
            }

            try {
                const response = await appBridge.oauthLogin(provider);
                const result = response.data.result;

                // null result means the user cancelled the native OAuth flow — not an error, so no
                // toast and no state change.
                if (!result) return;

                // The REQUESTED provider wins over whatever the bridge echoed back. `LoginPage` reads
                // `result.provider` instead, but here the row the user tapped is the intent, and this
                // way the field the packet requires is guaranteed to exist whatever shape the bridge
                // returns. The server normalizes it to lowercase alpha either way.
                const tokens = { ...(result as Record<string, unknown>), provider } as SocialAccountTokens;

                // Ask before committing: this is the only answer that names WHY a link is refused.
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
                // No local write: the row refreshes from `user.profile`, which is the only truth here.
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

    /**
     * Stub: there is no unlink endpoint yet (ADR-0033 request #7, still open in ADR-0042). This never
     * mutates state or claims success — it only explains that the action isn't supported yet. The real
     * unlink call gets wired in here once `SOCIAL_UNLINK_ENABLED` flips (see ../flags.ts).
     */
    const requestUnlink = useCallback(() => {
        toast({ title: t('mypage.accountInfo.social.unlinkComingSoon') });
    }, [t, toast]);

    return {
        isLinked,
        linkProvider,
        requestUnlink,
        isLinking: isLinkingSocial,
        /** `'unknown'` while the server has not told us — callers hide the section rather than guess. */
        socialState: linked.social,
    };
};
