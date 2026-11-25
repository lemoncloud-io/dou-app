import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime, type DomainChannel } from '@chatic/runtime-react';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
import type { InviteContext } from '../types';
import { beginInviteAcceptTrace } from '../../../../runtime/perf';
import { useCloudSessionCatalog } from '../../../../hooks/useCloudCatalog';
import { withAcceptor } from '../../../../utils/invitedCloudAcceptance';
import { isPlaceProfileAbsent } from '../../../../utils/placeProfile';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const CHANNEL_READ_TIMEOUT_MS = 3_000;

const readChannelOnce = (
    channel: runtime.data.PageRepositories['channel'],
    id: string
): Promise<DomainChannel | null> =>
    new Promise(resolve => {
        let settled = false;
        const settle = (item: DomainChannel | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            queueMicrotask(() => unsubscribe());
            resolve(item);
        };
        const timer = setTimeout(() => settle(null), CHANNEL_READ_TIMEOUT_MS);
        const unsubscribe = channel.observeItem(id, item => {
            if (item) settle(item);
        });
    });

export type InviteAcceptStep =
    | 'read-invite'
    | 'login-invite'
    | 'cache-cloud'
    | 'enter-cloud'
    | 'enter-site'
    | 'check-profile'
    | 'enter-channel';

export const resolveInviteErrorKey = (step: InviteAcceptStep, err: Error): string => {
    const message = err.message;

    if (message.startsWith('TIMEOUT:')) return 'inviteAccept.timeout';
    if (message.includes('Network Error') || message.includes('ERR_NETWORK')) return 'inviteAccept.networkError';

    if (step === 'read-invite' || step === 'login-invite') {
        if (message.includes('grace-timeout')) return 'inviteAccept.alreadyUsed';
        if (message.includes('400') || message.includes('404')) return 'inviteAccept.expired';
        if (message.includes('401') || message.includes('403')) return 'inviteAccept.authVerifyFailed';
        return 'inviteAccept.failed';
    }

    return 'inviteAccept.enterFailed';
};

export const useInviteAccept = ({ params, info }: InviteContext) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { runInviteFlow, isInviting } = runtime.session.useInviteFlow();
    const { enterCloud, isEnteringCloud } = useEnterInvitedCloud();
    const { enterSite, isEnteringSite } = useEnterInvitedSite();
    const { enterChannel } = useEnterInvitedChannel();
    const { cloud, profile, channel } = runtime.data.useRuntimeRepositories();
    const { delegatorId } = runtime.session.useSessionIdentity();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const ownedCloudsRef = useRef(ownedClouds);
    ownedCloudsRef.current = ownedClouds;
    const [missingDelegator, setMissingDelegator] = useState(false);
    const [profilePending, setProfilePending] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const runningRef = useRef(false);

    const resolveInvitedSiteId = useCallback(async (): Promise<string | undefined> => {
        if (info?.siteId) return info.siteId;
        if (info?.site$?.id) return info.site$.id;
        if (!info?.channelId) return undefined;
        try {
            await channel.syncChannels(0);
            const row = await readChannelOnce(channel, info.channelId);
            return row?.sid || undefined;
        } catch (error) {
            logger.warn('INVITE', 'could not read the invited room to find its place', { error });
            return undefined;
        }
    }, [info, channel]);

    const accept = useCallback(async () => {
        const { code, backend, relay } = params;
        if (!code || runningRef.current) return;
        if (!info) {
            logger.warn('INVITE', 'cloud invite accept pressed before the invite was read; ignored');
            return;
        }
        if (!backend && !relay) {
            logger.warn('INVITE', 'invite entry missing server info', { hasBackend: !!backend, relay: !!relay });
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        let step: InviteAcceptStep = 'login-invite';
        runningRef.current = true;
        setIsRunning(true);
        const trace = beginInviteAcceptTrace('cloud');
        let inviteLogin: runtime.session.InviteLogin | null = null;
        try {
            inviteLogin = await runInviteFlow({ code, backend });
            trace.mark('login');

            step = 'enter-cloud';
            const ownsInvitedCloud = !!info?.cloudId && ownedCloudsRef.current.some(owned => owned.id === info.cloudId);
            if (ownsInvitedCloud) {
                runtime.session.forgetInviteLogin(inviteLogin.handle);
                await enterCloud(info);
            } else {
                await enterCloud(info, inviteLogin);
            }
            trace.mark('cloud');

            if (info?.cloudId) {
                step = 'cache-cloud';
                const existing = await cloud.cacheRead(info.cloudId);
                await cloud.cacheWrite({
                    id: info.cloudId,
                    cid: info.cloudId,
                    name: info.cloudName,
                    ownerId: info.inviter$?.id,
                    owner$: info.inviter$ ? { id: info.inviter$.id, name: info.inviter$.name } : undefined,
                    backend: info.$envs?.backend,
                    wss: info.$envs?.wss,
                    cloudType: 'invited',
                    acceptedBy: withAcceptor(existing?.acceptedBy, delegatorId),
                });
            }

            step = 'enter-site';
            const siteId = await resolveInvitedSiteId();
            if (siteId) {
                await enterSite(siteId);
                trace.mark('site');
            } else {
                logger.warn('INVITE', 'cloud invite names no place; entering without the place profile step', {
                    data: { cloudId: info?.cloudId, channelId: info?.channelId },
                });
            }
            step = 'check-profile';
            const needsProfile = !!siteId && (await isPlaceProfileAbsent(profile));
            if (siteId) trace.mark('profile_check');
            if (needsProfile) {
                trace.end('profile');
                setProfilePending(true);
                return;
            }
            step = 'enter-channel';
            trace.end('ok');
            enterChannel(info);
            logger.info('INVITE', 'cloud invite accepted; entering channel', { cloudId: info?.cloudId });
        } catch (error) {
            if (inviteLogin) runtime.session.forgetInviteLogin(inviteLogin.handle);
            const err = toError(error);
            trace.end('error', { step });
            logger.error('AUTH', `[useInviteAccept] accept failed at step=${step}`, { error: err, data: { step } });

            if (err.message.includes('delegatorId')) {
                setMissingDelegator(true);
                return;
            }

            const key = resolveInviteErrorKey(step, err);
            toast({ title: t(key), variant: 'destructive' });
            setErrorKey(key);
        } finally {
            runningRef.current = false;
            setIsRunning(false);
        }
    }, [
        params,
        info,
        runInviteFlow,
        enterCloud,
        enterSite,
        enterChannel,
        cloud,
        delegatorId,
        profile,
        resolveInvitedSiteId,
        toast,
        t,
    ]);

    const finishProfile = useCallback(() => {
        setProfilePending(false);
        enterChannel(info);
    }, [enterChannel, info]);

    return {
        accept,
        isAccepting: isRunning || isInviting || isEnteringCloud || isEnteringSite,
        missingDelegator,
        errorKey,
        profilePending,
        finishProfile,
    };
};
