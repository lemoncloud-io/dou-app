import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { isCloudWideChannel, type DomainChannel, type IChannelRepository } from '@chatic/data';

import { useEnterInvitedChannel } from './useEnterInvitedChannel';
import { useEnterInvitedCloud } from './useEnterInvitedCloud';
import { useEnterInvitedSite } from './useEnterInvitedSite';
import type { InviteContext } from '../types';
import { withAcceptor } from '../../../../utils/invitedCloudAcceptance';
import { isPlaceProfileAbsent } from '../../../../utils/placeProfile';
import { runtime } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** How long to wait for the invited room's row to come out of the cache before giving up on it. */
const CHANNEL_READ_TIMEOUT_MS = 3_000;

/** The first row the cache emits for `id` (or `null` on timeout) — a one-shot read of an observer. */
const readChannelOnce = (channel: IChannelRepository, id: string): Promise<DomainChannel | null> =>
    new Promise(resolve => {
        let settled = false;
        const settle = (item: DomainChannel | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // Deferred: the observer may emit synchronously, inside `observeItem`, before the handle
            // below exists. A microtask runs after it is assigned.
            queueMicrotask(() => unsubscribe());
            resolve(item);
        };
        const timer = setTimeout(() => settle(null), CHANNEL_READ_TIMEOUT_MS);
        const unsubscribe = channel.observeItem(id, item => {
            if (item) settle(item);
        });
    });

/** The invite-accept pipeline step that was in flight when an error was thrown. */
type InviteAcceptStep =
    | 'login-invite'
    | 'cache-cloud'
    | 'enter-cloud'
    | 'enter-site'
    | 'check-profile'
    | 'enter-channel';

/**
 * Maps a failure (the step it happened in + the thrown error) to a specific `inviteAccept.*` i18n key
 * so the toast and error panel can name the actual cause instead of a generic "failed".
 *
 * Ordering matters: transport-shape errors (timeout/network) are checked first since they can occur in
 * any step. Server errors arrive as HTTP-200 bodies like `"400 INVALID - ..."` (see throwIfApiError),
 * so we match by HTTP-code substring — the same convention used by ErrorFallback. `delegatorId` is not
 * handled here: it is branched to the missing-delegator panel before this helper runs.
 */
const resolveInviteErrorKey = (step: InviteAcceptStep, err: Error): string => {
    const message = err.message;

    if (message.startsWith('TIMEOUT:')) return 'inviteAccept.timeout';
    if (message.includes('Network Error') || message.includes('ERR_NETWORK')) return 'inviteAccept.networkError';

    if (step === 'login-invite') {
        // The invite itself is bad: expired, revoked, or a malformed code.
        if (message.includes('400') || message.includes('404')) return 'inviteAccept.expired';
        // Authentication/authorization rejected the invite login.
        if (message.includes('401') || message.includes('403')) return 'inviteAccept.authVerifyFailed';
        return 'inviteAccept.failed';
    }

    // Login succeeded but a later token/entry step failed — the user is registered but couldn't enter.
    return 'inviteAccept.enterFailed';
};

/**
 * Drives invite acceptance: logs in with the invite code via `runtime.session.useInviteFlow`, then enters the
 * invite target in order — cloud → site → channel — using identifiers from `MyInviteView`. Each
 * step no-ops when its identifier is absent; with no channel the channel step only leaves the accept screen. No
 * manual cloud/site state writes or sync flags — web-core owns that.
 *
 * **The place profile is asked for between the site and the channel.** A profile can only be saved
 * from inside its place — the server writes it to the site the session is on — and before the
 * accept the invitee is not a member, so the session cannot be there yet. Right after the site
 * switch is the first moment it can be written, and the last one before the invitee is seen in a
 * room. When one is missing the pipeline stops with `profilePending` set and the caller shows the
 * form; `finishProfile` resumes into the channel. The accept is already committed at that point, so
 * leaving the app mid-form leaves a member without a name — the missing-profile prompts elsewhere
 * (the room-settings nudge, home's profile menu) pick that up, not this flow.
 */
export const useInviteAccept = ({ params, info }: InviteContext) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { runInviteFlow, isInviting } = runtime.session.useInviteFlow();
    const { enterCloud, isEnteringCloud } = useEnterInvitedCloud();
    const { enterSite, isEnteringSite } = useEnterInvitedSite();
    const { enterChannel } = useEnterInvitedChannel();
    // The app graph follows the selection on every call, so after the cloud and site switches below
    // `profile` reads the invited place, not the one this render started on.
    const { cloud, profile, channel } = runtime.data.useRuntimeRepositories();
    // The guest the invite login binds the acceptance to — recorded on the cached cloud below.
    const { delegatorId } = runtime.session.useSessionIdentity();
    const [missingDelegator, setMissingDelegator] = useState(false);
    const [profilePending, setProfilePending] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    // One pipeline at a time, for its whole length. The step hooks each report only their own call,
    // which leaves gaps between steps (the cache write, the place lookup, the profile check) and
    // during the cloud step's retry waits — seconds in which Accept looked idle and a second press
    // started a second pipeline.
    const [isRunning, setIsRunning] = useState(false);
    const runningRef = useRef(false);

    /**
     * The place the invite leads into. An invite is issued with nothing but a `channelId`; the server
     * does answer a room invite with the room's `siteId`, but the published invite view does not
     * declare it (only the stored model does), so it is not the only source. Missing, it falls back
     * to the invite's place card, then to the room itself: one cloud-wide channel delta, then the
     * room's row from the cache. A cloud 1:1 belongs to no place, so it resolves to nothing. `undefined` means the place
     * could not be named — the caller enters without switching and says so in the log, rather than
     * silently skipping the profile step as it once did.
     */
    const resolveInvitedSiteId = useCallback(async (): Promise<string | undefined> => {
        if (info?.siteId) return info.siteId;
        if (info?.site$?.id) return info.site$.id;
        if (!info?.channelId) return undefined;
        try {
            await channel.syncChannels(0);
            const row = await readChannelOnce(channel, info.channelId);
            if (!row || isCloudWideChannel(row)) return undefined;
            return row.sid || undefined;
        } catch (error) {
            logger.warn('INVITE', 'could not read the invited room to find its place', { error });
            return undefined;
        }
    }, [info, channel]);

    const accept = useCallback(async () => {
        const { code, backend, relay } = params;
        if (!code || runningRef.current) return;
        // Relay invites legitimately carry no backend address: registerUserWithInviteCode resolves the
        // env relay endpoint. Only a link that is neither addressed nor marked relay is unusable.
        if (!backend && !relay) {
            logger.warn('INVITE', 'invite entry missing server info', { hasBackend: !!backend, relay: !!relay });
            toast({ title: t('inviteAccept.missingServerInfo'), variant: 'destructive' });
            return;
        }

        // Tracks the pipeline step in flight so a failure can name where it happened. Every underlying
        // token call (delegate/exchange/refresh) is traced separately via traceTokenCall in web-core.
        let step: InviteAcceptStep = 'login-invite';
        runningRef.current = true;
        setIsRunning(true);
        try {
            // The answer is the invitee's own cloud token; the cloud is entered with it (see
            // `useEnterInvitedCloud` for why a re-issue cannot stand in for it).
            const inviteToken = await runInviteFlow({ code, backend });

            // Entered BEFORE the cloud is cached. Caching it lists it, and a listed cloud is what the
            // background sockets prepare a socket for — by re-issuing through `delegate-cloud`. Once
            // the cloud is committed it is left out of that list, so nothing can re-issue it under
            // the entry and land the cloud's socket on a user other than the invitee.
            step = 'enter-cloud';
            await enterCloud(info, inviteToken);

            // Persist the invited cloud (cloudType:'invited') so it surfaces to useInvitedClouds /
            // the cloud sheet. Skipped when the invite carries no cloudId. Both id and cid are keyed
            // to cloudId, so consumers that fall back id → cid always have a value.
            // Store the display info too (name + owner) so the switcher renders a proper label and
            // owner caption without a separate fetch: use the invite's cloudName as the label and
            // the inviter as the owner.
            // `acceptedBy` adds this guest to whoever accepted the cloud on this device before, read
            // back first because the write replaces the field rather than merging it.
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
            } else {
                logger.warn('INVITE', 'cloud invite names no place; entering without the place profile step', {
                    data: { cloudId: info?.cloudId, channelId: info?.channelId },
                });
            }
            // Only once the session is in the invited place: without a switch it is still on whatever
            // place was active before, and asking there would name the wrong one.
            // `isPlaceProfileAbsent` fails open, so a profile-read outage never blocks the entry.
            step = 'check-profile';
            if (siteId && (await isPlaceProfileAbsent(profile))) {
                setProfilePending(true);
                return;
            }
            step = 'enter-channel';
            enterChannel(info);
            logger.info('INVITE', 'cloud invite accepted; entering channel', { cloudId: info?.cloudId });
        } catch (error) {
            const err = toError(error);
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

    /** Leaves the profile step — saved or skipped — and continues into the invited room. */
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
