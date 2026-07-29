import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSessionIdentity } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { isNative, logger } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { useAttachSocial } from '../../../hooks';
import { getSocketErrorCode, toError } from '../../../utils/errors';
import type { AttachSocialTokens } from '../../../hooks/useAttachSocial';

/** Providers this screen offers. Apple is further gated to iOS by the caller (mirrors LoginPage). */
export type SocialProvider = 'google' | 'apple';

const STORAGE_KEY = 'chatic-linked-social-providers';

type LinkedProvidersByUser = Record<string, string[]>;

/**
 * Reads the whole uid -> linked-provider-ids map. A corrupt or non-object value resets to an empty
 * map so one bad write can never break the section — it just falls back to "nothing linked" (the
 * safe direction, since it only offers to link again rather than claiming a false state).
 */
const readAllLinkedProviders = (): LinkedProvidersByUser => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const result: LinkedProvidersByUser = {};
        for (const [uid, providers] of Object.entries(parsed)) {
            if (Array.isArray(providers)) {
                result[uid] = providers.filter((p): p is string => typeof p === 'string');
            }
        }
        return result;
    } catch {
        return {};
    }
};

/** Linked provider ids for one uid (empty when the uid is unknown or nothing is cached yet). */
export const readLinkedProviders = (uid: string | null | undefined): string[] => {
    if (!uid) return [];
    return readAllLinkedProviders()[uid] ?? [];
};

/** Records that `provider` attached successfully for `uid`. Idempotent — a repeat write is a no-op. */
const writeLinkedProvider = (uid: string, provider: SocialProvider): void => {
    if (typeof window === 'undefined') return;
    const all = readAllLinkedProviders();
    const current = all[uid] ?? [];
    if (current.includes(provider)) return;
    const next: LinkedProvidersByUser = { ...all, [uid]: [...current, provider] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

/**
 * Social-link status + attach orchestration for the mypage account screen.
 *
 * There is no backend endpoint that lists a user's linked social accounts (`MyUserView.account$` is
 * the single ORIGINAL sign-up account, not the set of everything `auth.attach-social` has since
 * added — see apps/web/docs/feature/account/social-links.md). So "linked" here means "this device
 * remembers a successful attach for this uid", cached in localStorage and scoped by uid so a
 * different account on the same device never inherits another account's linked state.
 *
 * `attach-social` links a credential to the CURRENT (already main-user) session — it never changes
 * the session, so a successful attach only updates the local cache, never navigation or identity.
 */
export const useSocialLinks = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { userId } = useSessionIdentity();
    const { attach, isPending } = useAttachSocial();

    const [linkedProviders, setLinkedProviders] = useState<string[]>(() => readLinkedProviders(userId));

    // Re-read whenever the session's uid changes (login/logout/account switch), so a stale cache
    // from a previous account can never leak into the new one.
    useEffect(() => {
        setLinkedProviders(readLinkedProviders(userId));
    }, [userId]);

    const isLinked = useCallback((provider: SocialProvider) => linkedProviders.includes(provider), [linkedProviders]);

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
                // toast and no cache change.
                if (!result) return;

                await attach(result as AttachSocialTokens);

                if (userId) writeLinkedProvider(userId, provider);
                setLinkedProviders(readLinkedProviders(userId));
                toast({ title: t('mypage.accountInfo.social.linkSuccess') });
            } catch (e) {
                logger.error('AUTH', '[useSocialLinks] attach-social failed', { error: toError(e) });
                const code = getSocketErrorCode(e);
                const messageKey =
                    code === 409
                        ? 'mypage.accountInfo.social.alreadyLinkedElsewhere'
                        : 'mypage.accountInfo.social.linkFailed';
                toast({ title: t(messageKey), variant: 'destructive' });
            }
        },
        [attach, t, toast, userId]
    );

    /**
     * Stub: there is no unlink endpoint yet (ADR-0033 request #7). This never mutates the cache or
     * claims success — it only explains that the action isn't supported yet. The real unlink call
     * gets wired in here once `SOCIAL_UNLINK_ENABLED` flips (see ../flags.ts).
     */
    const requestUnlink = useCallback(() => {
        toast({ title: t('mypage.accountInfo.social.unlinkComingSoon') });
    }, [t, toast]);

    return { isLinked, linkProvider, requestUnlink, isLinking: isPending };
};
