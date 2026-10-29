import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';

import { serverErrorText, toError, toastFailure, useJoinedCloudsStore } from '../../../shared';
import { fetchInviteCodeInfo } from '../apis';
import { inviteLoginErrorText, isTrustedInviteBackend, parseInviteInput } from '../utils';
import type { InviteLoginError } from '../utils';

/** Backends this build talks to; read per call because `config` answers undefined before boot. */
const configuredBackends = (): string[] => [
    config.get<string>('net.relay.backend') ?? '',
    config.get<string>('net.admin.backend') ?? '',
];

/** What the preview step shows, plus what `enter` needs so the lookup is not repeated. */
export interface InvitePreview {
    code: string;
    backend?: string;
    info: MyInviteView | null;
    placeName?: string;
    inviterName?: string;
    /** True when this preview registered the device guest, so backing out can undo it. */
    createdGuest: boolean;
}

export type InvitePreviewResult = { preview: InvitePreview } | { error: InviteLoginError; createdGuest: boolean };

/** Lookup states that are not `pending`, as the failure the person sees. */
const BLOCKED_STATE: Record<string, 'used' | 'expired' | 'canceled'> = {
    accepted: 'used',
    expired: 'expired',
    canceled: 'canceled',
    rejected: 'canceled',
};

/**
 * Invite-code auth flow — mirrors apps/web's invite acceptance (useInviteAccept +
 * useEnterInvitedCloud/Site) re-shaped into one hook for the desktop login screen:
 * 1. parse a full invite link OR a bare `invt:<id>:<code>` (link yields a backend override)
 * 2. guest-login the device (yields the delegatorId the invite exchange needs + hydrates session)
 * 3. resolve $envs.wss / cloudId / siteId from the target backend (best-effort)
 * 4. exchange the code -> cloud token against that backend (runtime.session.registerUserWithInviteCode)
 * 5. persist the invited cloud locally, then enter cloud + site via the v2 session switches
 *
 * web-core owns credential/cloud/site state + socket re-auth — no manual cloudCore /
 * socket-store writes here. Works across deployments: the invite link carries its own
 * backend, so the desktop client doesn't need its .env pointed at the issuing deployment.
 */
export const useInviteLogin = () => {
    const { t } = useTranslation();
    const { deviceId } = runtime.session.useDynamicDeviceId();
    const { mutateAsync: loginGuest } = runtime.session.useLoginRelayGuestByDevice();
    const { switchCloud } = runtime.session.useSwitchCloudSession();
    const { switchSite } = runtime.session.useSiteSwitch();
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const addJoinedCloud = useJoinedCloudsStore(s => s.addJoinedCloud);
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<InviteLoginError | null>(null);

    /** Parse and trust-check a paste. Nothing is sent and no session is made until this passes. */
    const accept = useCallback((input: string): { code: string; backend?: string } | InviteLoginError => {
        const parsed = parseInviteInput(input);
        if ('refused' in parsed) return { kind: parsed.refused };
        const { code, backend } = parsed;
        if (backend && !isTrustedInviteBackend(backend, configuredBackends())) {
            logger.warn('AUTH', '[useInviteLogin] invite link names an untrusted backend', { backend });
            return { kind: 'backend' };
        }
        return { code, backend };
    }, []);

    /**
     * The invite exchange is signed with a guest delegatorId. Reuse the existing guest session if
     * there is one (the in-app "Join" dialog is reachable with a session already live) — only
     * bootstrap a guest when none exists. An account signed in on top of a device guest keeps that
     * guest's id and joins under it; one that never had a device guest has no delegatorId, so
     * accepting here would silently downgrade it to a guest — surface that instead of clobbering
     * its identity.
     */
    const ensureGuest = useCallback(async (): Promise<
        { delegatorId: string; createdGuest: boolean } | InviteLoginError
    > => {
        await runtime.boot.startWebTransportInit();
        let delegatorId = runtime.session.getIdentityContext().delegatorId;
        let createdGuest = false;
        if (!delegatorId) {
            // The identity context carries no guest flag; the active token's role is the source
            // (the same one `useRuntimeProfile().isGuest` reads).
            const isGuest = runtime.session.getActiveSessionUser()?.userRole === 'guest';
            if (runtime.session.getIdentityContext().isAuthenticated && !isGuest) return { kind: 'loggedIn' };
            await loginGuest(deviceId);
            createdGuest = true;
            delegatorId = runtime.session.getIdentityContext().delegatorId;
        }
        if (!delegatorId) throw new Error('delegatorId unavailable after device registration');
        return { delegatorId, createdGuest };
    }, [deviceId, loginGuest]);

    /** Exchange the code for the invited cloud and enter it (steps 4-5 of the flow above). */
    const exchange = useCallback(
        async (code: string, backend: string | undefined, info: MyInviteView | null, delegatorId: string) => {
            const tokenView = await runtime.session.registerUserWithInviteCode(code, delegatorId, backend);

            // `tokenView.cloudId` is the cloud's AWS account-no; the invite carries no real
            // cloud id, so it's the only identifier for this invited cloud and is used purely
            // as its restore key. The session switch guards against an account-no target.
            const cloudId = info?.cloudId ?? tokenView.cloudId;
            if (cloudId) {
                // Invited clouds aren't in the relay catalog — persist locally (with the
                // invite's backend/wss) so the rail surfaces it and the cloud switch can
                // resolve its endpoints. Mirrors apps/web useInviteAccept. The name goes in
                // too: this row is the cloud's only durable record, and without it a rail
                // rebuilt from the cache can label the tile with nothing but its id.
                await cloudRepository.cacheWrite({
                    id: cloudId,
                    cid: cloudId,
                    name: info?.cloudName ?? undefined,
                    backend: info?.$envs?.backend ?? backend ?? undefined,
                    wss: info?.$envs?.wss ?? undefined,
                    cloudType: 'invited',
                });
                // Remember the joined cloud so the rail shows it immediately —
                // the broker cloud list is eventually consistent and may omit it.
                addJoinedCloud({ id: cloudId, name: info?.cloudName ?? undefined });
                // Enter the invited cloud — web-core commits the cloud session and
                // re-authenticates the socket (no manual socket-store writes).
                await switchCloud(cloudId);
            }

            // Enter the invited place so the socket connects to it (mirrors web handleAccept).
            if (info?.siteId) {
                await switchSite(info.siteId);
            }

            // The broker cloud list is eventually consistent — refetch so the
            // just-joined cloud appears in the rail alongside the Default Cloud.
            void queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
        },
        [cloudRepository, addJoinedCloud, switchCloud, switchSite, queryClient]
    );

    /** A failure from the network or backend, surfaced as the text the page shows. */
    const serverFailure = useCallback(
        (error: unknown, toast: boolean, step: 'login' | 'preview' | 'enter'): InviteLoginError => {
            const err = toError(error);
            logger.error('AUTH', `[useInviteLogin] ${step} failed`, { error: err });
            const failure: InviteLoginError = { kind: 'server', message: serverErrorText(err) };
            if (toast) toastFailure(inviteLoginErrorText(failure, t), err);
            return failure;
        },
        [t]
    );

    const login = useCallback(
        /** Resolves to the failure, or null once the invited cloud is entered. */
        async (input: string): Promise<InviteLoginError | null> => {
            // Checked before the guest login below, so a rejected link creates no session either.
            const accepted = accept(input);
            if ('kind' in accepted) {
                setError(accepted);
                return accepted;
            }
            const { code, backend } = accepted;

            setIsSubmitting(true);
            setError(null);

            try {
                const guest = await ensureGuest();
                if ('kind' in guest) {
                    setError(guest);
                    return guest;
                }

                // Resolve the invite's deployment env (wss/cloud/site) when a backend is known.
                let info: MyInviteView | null = null;
                if (backend) {
                    info = await fetchInviteCodeInfo(code, backend).catch(error => {
                        logger.warn('AUTH', '[useInviteLogin] invite-code lookup failed; continuing', {
                            error: toError(error),
                        });
                        return null;
                    });
                }

                await exchange(code, backend, info, guest.delegatorId);
                return null;
            } catch (error) {
                const failure = serverFailure(error, true, 'login');
                setError(failure);
                return failure;
            } finally {
                setIsSubmitting(false);
            }
        },
        [accept, ensureGuest, exchange, serverFailure]
    );

    /**
     * First half of the two-step join: everything up to the exchange. It makes the device guest
     * session the signed lookup needs, then reads the invite without consuming it. Unlike `login`,
     * a failed lookup or an invite that is not pending stops here — the person is told before
     * anything is joined, and no place details are shown for an invite that cannot be used.
     * A guest this call registered is reported (`createdGuest`) even on failure so the page can
     * undo it when the person backs out.
     */
    const preview = useCallback(
        async (input: string): Promise<InvitePreviewResult> => {
            const accepted = accept(input);
            if ('kind' in accepted) return { error: accepted, createdGuest: false };
            const { code, backend } = accepted;

            let createdGuest = false;
            try {
                const guest = await ensureGuest();
                if ('kind' in guest) return { error: guest, createdGuest: false };
                createdGuest = guest.createdGuest;

                // A bare code names no backend, so there is nothing to look up; it goes on without details.
                const info = backend ? await fetchInviteCodeInfo(code, backend) : null;
                // The backend can leave `state` at pending while the expiry time has passed, so the
                // time is read as well; 0 or a missing value means no expiry was set.
                const lapsed = !!info?.expiredAt && info.expiredAt < Date.now();
                const blocked =
                    (info?.state ? BLOCKED_STATE[info.state] : undefined) ?? (lapsed ? 'expired' : undefined);
                if (blocked) return { error: { kind: blocked }, createdGuest };

                return {
                    preview: {
                        code,
                        backend,
                        info,
                        placeName: info?.cloudName,
                        inviterName: info?.inviter$?.name,
                        createdGuest,
                    },
                };
            } catch (error) {
                return { error: serverFailure(error, false, 'preview'), createdGuest };
            }
        },
        [accept, ensureGuest, serverFailure]
    );

    /**
     * Second half: exchange the previewed code. Resolves to the failure, or null once the cloud is
     * entered. Unlike `login` it keeps no `isSubmitting`/`error` of its own — the page that drives
     * the two steps owns both.
     */
    const enter = useCallback(
        async (previewed: InvitePreview): Promise<InviteLoginError | null> => {
            try {
                const guest = await ensureGuest();
                if ('kind' in guest) return guest;
                await exchange(previewed.code, previewed.backend, previewed.info, guest.delegatorId);
                return null;
            } catch (error) {
                return serverFailure(error, true, 'enter');
            }
        },
        [ensureGuest, exchange, serverFailure]
    );

    /** Drops the last failure — the caller is editing the code or leaving. */
    const clearError = useCallback(() => setError(null), []);

    return { login, preview, enter, isSubmitting, error, clearError };
};
