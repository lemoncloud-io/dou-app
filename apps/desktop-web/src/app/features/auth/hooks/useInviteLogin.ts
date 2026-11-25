import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { serverErrorText, toError, toastFailure, useJoinedCloudsStore } from '../../../shared';
import { fetchInviteCodeInfo } from '../apis';
import { inviteLoginErrorText, isTrustedInviteBackend, parseInviteInput } from '../utils';
import type { InviteLoginError } from '../utils';

const configuredBackends = (): string[] => [
    runtime.settings.get<string>('net.relay.backend') ?? '',
    runtime.settings.get<string>('net.admin.backend') ?? '',
];

export interface InvitePreview {
    code: string;
    backend?: string;
    info: MyInviteView | null;
    placeName?: string;
    inviterName?: string;
    createdGuest: boolean;
}

export type InvitePreviewResult = { preview: InvitePreview } | { error: InviteLoginError; createdGuest: boolean };

const BLOCKED_STATE: Record<string, 'used' | 'expired' | 'canceled'> = {
    accepted: 'used',
    expired: 'expired',
    canceled: 'canceled',
    rejected: 'canceled',
};

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

    const ensureGuest = useCallback(async (): Promise<
        { delegatorId: string; createdGuest: boolean } | InviteLoginError
    > => {
        let delegatorId = runtime.session.getIdentityContext().delegatorId;
        let createdGuest = false;
        if (!delegatorId) {
            const isGuest = runtime.session.getActiveSessionUser()?.userRole === 'guest';
            if (runtime.session.getIdentityContext().isAuthenticated && !isGuest) return { kind: 'loggedIn' };
            await loginGuest(deviceId);
            createdGuest = true;
            delegatorId = runtime.session.getIdentityContext().delegatorId;
        }
        if (!delegatorId) throw new Error('delegatorId unavailable after device registration');
        return { delegatorId, createdGuest };
    }, [deviceId, loginGuest]);

    const exchange = useCallback(
        async (code: string, backend: string | undefined, info: MyInviteView | null, delegatorId: string) => {
            const acceptorId = runtime.data.getAcceptorId();
            const inviteLogin = await runtime.session.registerUserWithInviteCode(code, delegatorId, backend);
            runtime.session.forgetInviteLogin(inviteLogin.handle);

            const cloudId = info?.cloudId ?? inviteLogin.cloudId;
            if (cloudId) {
                const existing = await cloudRepository.cacheRead(cloudId);
                await cloudRepository.cacheWrite({
                    id: cloudId,
                    cid: cloudId,
                    name: info?.cloudName ?? undefined,
                    backend: info?.$envs?.backend ?? backend ?? undefined,
                    wss: info?.$envs?.wss ?? undefined,
                    cloudType: 'invited',
                    acceptedBy: runtime.data.withAcceptor(existing?.acceptedBy, acceptorId),
                });
                addJoinedCloud({ id: cloudId, name: info?.cloudName ?? undefined, ownerUid: acceptorId ?? undefined });
                await switchCloud(cloudId);
            }

            if (info?.siteId) {
                await switchSite(info.siteId);
            }

            void queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
        },
        [cloudRepository, addJoinedCloud, switchCloud, switchSite, queryClient]
    );

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
        async (input: string): Promise<InviteLoginError | null> => {
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

                const info = backend ? await fetchInviteCodeInfo(code, backend) : null;
                const now = Date.now();
                const lapsed = [info?.expiredAt, info?.graceAt].some(at => !!at && at < now);
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

    const clearError = useCallback(() => setError(null), []);

    return { login, preview, enter, isSubmitting, error, clearError };
};
