import type { JSX } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useInviteInfo, useSessionLogout } from '@chatic/web-core';

import { useInviteAccept } from '../hooks';
import { isInviteEntry, parseInviteDeeplink } from '../types';
import { ROUTES } from '../../../routes/paths';

/**
 * Self-contained invite-accept overlay driven entirely by the current URL.
 *
 * It reads the invite params off `location.search` and renders nothing unless the link is a
 * fully-formed invite entry (`provider=invite` + `code` + `_backend`). This lets home mount it
 * unconditionally — it stays invisible on normal navigation and only surfaces the popup when an
 * invite deeplink lands. Dismiss/back strips the query string so the popup cannot reappear.
 */
export const InviteDialog = (): JSX.Element | null => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const logout = useSessionLogout();

    const params = useMemo(() => parseInviteDeeplink(location.search), [location.search]);

    // Invite metadata (inviter / target name) to personalize the prompt. Hooks must run before any
    // early return, so this is called unconditionally; the query stays disabled for non-invites.
    const { data: info } = useInviteInfo(params.code, params.backend);
    const { accept, isAccepting, missingDelegator, hasError } = useInviteAccept({ params, info });

    // Not an invite landing: render nothing so home shows normally.
    if (!isInviteEntry(params)) return null;

    // Prefer inviter name, then the invite's own display name, for the heading/avatar.
    const inviterName = info?.inviter$?.name;
    const targetName = info?.name ?? info?.site$?.name;
    const headingText = inviterName ? t('inviteAccept.invitedBy', { name: inviterName }) : t('inviteAccept.title');
    const avatarInitial = inviterName?.trim().charAt(0).toUpperCase() || '?';

    // Show invite error with retry
    if (hasError) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f]">
                            {t('inviteAccept.invalidLink')}
                        </p>
                        <button
                            onClick={() => navigate(ROUTES.home, { replace: true })}
                            className="w-full max-w-[200px] h-[42px] rounded-full bg-[#b0ea10] text-[14px] font-semibold text-[#222325]"
                        >
                            {t('inviteAccept.goBack')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show missing delegatorId error with logout action
    if (missingDelegator) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(41,41,58,0.23)]">
                <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                    <div className="flex flex-col items-center pt-4 w-full gap-4">
                        <p className="text-center text-[16px] font-medium text-[#84888f] whitespace-pre-line">
                            {t('inviteAccept.missingDelegator')}
                        </p>
                        <button
                            onClick={() => logout({ preserveUrl: true })}
                            className="w-full max-w-[200px] h-[42px] rounded-full bg-[#b0ea10] text-[14px] font-semibold text-[#222325]"
                        >
                            {t('auth.logout')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Show invite accept UI. Inviter/target come from MyInviteView; falls back to a generic prompt
    // until the metadata resolves.
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(41,41,58,0.23)]">
            <div className="relative mx-4 w-full max-w-[308px] rounded-[18px] bg-white/80 backdrop-blur-[4px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)] px-[10px] pt-[26px] pb-[14px]">
                <div className="flex flex-col items-center pt-4 w-full">
                    <div className="w-[82px] h-[82px] rounded-full border border-[#f4f5f5] bg-[rgba(0,43,126,0.04)] flex items-center justify-center overflow-hidden">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-200 to-green-400 flex items-center justify-center text-2xl font-semibold text-white">
                            {avatarInitial}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-1 px-[22px] py-2 mt-1 w-full">
                        <p className="text-center text-[16px] font-semibold leading-[1.45] tracking-[-0.16px] text-[#222325]">
                            {headingText}
                        </p>
                        {targetName && (
                            <p className="text-center text-[14px] font-medium text-[#84888f]">{targetName}</p>
                        )}
                        <p className="text-center text-[14px] font-medium leading-[1.45] tracking-[-0.16px] text-[#84888f]">
                            {t('inviteAccept.description')}
                        </p>
                    </div>

                    <div className="flex flex-col items-center w-full px-[22px] pt-5 pb-4 gap-3">
                        <button
                            onClick={accept}
                            disabled={isAccepting}
                            className="w-full h-[50px] rounded-full bg-[#b0ea10] text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#222325] disabled:opacity-50"
                        >
                            {isAccepting ? t('inviteAccept.accepting') : t('inviteAccept.accept')}
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.home, { replace: true })}
                            disabled={isAccepting}
                            className="w-full h-[50px] rounded-full text-[16px] font-semibold leading-[22px] tracking-[0.08px] text-[#84888f] disabled:opacity-50"
                        >
                            {t('inviteAccept.decline')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
