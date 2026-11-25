import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { AccountLinkMode } from '../../../../hooks/useLinkAccount';
import { useInviteCountdown, type InviteCountdown } from '../../hooks/useInviteCountdown';
import { useResolveInviteChannel, type InviteChannelSource } from './useResolveInviteChannel';
import { useIsAccountGuest, useRelayInviteMutations, type RelayInviteView } from '../../../../hooks';
import { useStackNavigate } from '../../../../navigation';
import { usePendingInviteChannel } from '../../../../stores/usePendingInviteChannel';
import type { InviteInfo } from '../types';
import { retryAfterRelayReconnect } from '../lib/retryAfterRelayReconnect';
import { getSocketErrorCode } from '../../../../utils/errors';
import { isPlaceProfileAbsent } from '../../../../utils/placeProfile';
import { ROUTES } from '../../../../routes/paths';
import { beginInviteAcceptTrace, type InviteAcceptTrace } from '../../../../runtime/perf';
import { useLogoutCloudSession } from '../../../../runtime/useLogoutCloudSession';

export type RelayInviteInfo = RelayInviteView & Pick<InviteInfo, 'expiredAt' | 'inviter$' | 'site$'>;

export type RelayInvitePhase =
    | 'loading'
    | 'review'
    | 'declining'
    | 'submitting'
    | 'verifying'
    | 'profiling'
    | 'awaitingChannel'
    | 'notice'
    | 'closed';

export type RelayInviteNotice =
    | 'expired'
    | 'alreadyJoined'
    | 'inviteCanceled'
    | 'rejected'
    | 'notFound'
    | 'wrongNumber'
    | 'taken'
    | 'generic';

const resolveNotice = (status: number | undefined, stage: 'get' | 'accept' | 'reject'): RelayInviteNotice => {
    if (status === 404) return 'notFound';
    if (status === 409) return stage === 'reject' ? 'alreadyJoined' : 'taken';
    if (status === 400) return stage === 'accept' ? 'expired' : 'notFound';
    if (status === 403) return stage === 'accept' ? 'wrongNumber' : 'notFound';
    return 'generic';
};

const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

const awaitRelaySocket = async (): Promise<boolean> => {
    const verified = await runtime.connection.waitUntilVerified(
        runtime.connection.RELAY_SLOT,
        HANDSHAKE_WAIT_TIMEOUT_MS
    );
    if (verified) return true;
    logger.warn('INVITE', '[useRelayInviteFlow] relay handshake not verified; proceeding best-effort');
    return false;
};

const callOnRelay = <T>(stage: 'entry' | 'advance' | 'accept', task: () => Promise<T>, isCurrent: () => boolean) =>
    retryAfterRelayReconnect(task, {
        waitForRelay: awaitRelaySocket,
        shouldRetry: isCurrent,
        onRetry: error =>
            logger.warn(
                'INVITE',
                `[useRelayInviteFlow] relay socket closed during ${stage}; retrying after reconnect`,
                {
                    error,
                }
            ),
    });

export interface RelayInviteFlow {
    phase: RelayInvitePhase;
    invite: RelayInviteInfo | null;
    notice: RelayInviteNotice | null;
    countdown: InviteCountdown | null;
    verifyMode: AccountLinkMode;
    accept: () => void;
    decline: () => void;
    confirmDecline: () => void;
    isRejecting: boolean;
    close: () => void;
    onVerified: () => void;
    onProfileSaved: () => void;
    skipProfile: () => void;
    cancelStep: () => void;
    dismissNotice: () => void;
    retry: () => void;
}

export const useRelayInviteFlow = (code: string): RelayInviteFlow => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const enterStack = useStackNavigate();
    const mutations = useRelayInviteMutations();
    const { resolveChannel } = useResolveInviteChannel();
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { logoutCloudSession } = useLogoutCloudSession();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const [phase, setPhase] = useState<RelayInvitePhase>('loading');
    const [invite, setInvite] = useState<RelayInviteInfo | null>(null);
    const [notice, setNotice] = useState<RelayInviteNotice | null>(null);
    const [isRejecting, setIsRejecting] = useState(false);
    const [refusedAsMainUser, setRefusedAsMainUser] = useState(false);

    const isGuest = useIsAccountGuest();
    const verifyMode: AccountLinkMode = isGuest || refusedAsMainUser ? 'login' : 'link';

    const countdown = useInviteCountdown(invite?.expiredAt, { minuteUntilImminent: true });

    const latest = useRef({
        mutations,
        resolveChannel,
        setPendingChannel,
        profileRepository,
        enterStack,
        toast,
        t,
        verifyMode,
        logoutCloudSession,
    });
    latest.current = {
        mutations,
        resolveChannel,
        setPendingChannel,
        profileRepository,
        enterStack,
        toast,
        t,
        verifyMode,
        logoutCloudSession,
    };

    const runIdRef = useRef(0);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);
    const isStale = (run: number) => !aliveRef.current || runIdRef.current !== run;

    const verifiedRef = useRef(false);

    const profileSavedRef = useRef(false);

    const profileSkippedRef = useRef(false);

    const [attempt, setAttempt] = useState(0);

    const noticeOpenRef = useRef(false);

    const goHome = useCallback(() => {
        runIdRef.current += 1;
        noticeOpenRef.current = false;
        setPhase('closed');
        latest.current.enterStack('deeplink', ROUTES.home);
    }, []);

    const fail = useCallback((next: RelayInviteNotice) => {
        noticeOpenRef.current = true;
        setNotice(next);
        setPhase('notice');
    }, []);

    const failTerminalState = useCallback(
        (state: string, next: RelayInviteNotice, stage: 'entry' | 'advance', trace?: InviteAcceptTrace) => {
            logger.warn('INVITE', `[useRelayInviteFlow] invite in terminal state: ${state}`, { stage });
            trace?.end('notice');
            return fail(next);
        },
        [fail]
    );

    const enterChannel = useCallback(
        async (run: number, trace: InviteAcceptTrace, acceptedChannelId?: string, inviterId?: string) => {
            if (!acceptedChannelId) setPhase('awaitingChannel');

            let room: InviteChannelSource = 'none';
            const channelId = await latest.current.resolveChannel(code, {
                acceptedChannelId,
                inviterId,
                onResolved: source => {
                    room = source;
                },
            });
            if (isStale(run)) return;
            trace.mark('room');
            trace.end(channelId ? 'ok' : 'pending', { room });

            logger.info('INVITE', 'relay invite accepted; entering channel', { channelId, resolved: !!channelId });
            setPhase('closed');

            if (channelId) latest.current.setPendingChannel(channelId);
            else latest.current.toast({ title: latest.current.t('relayInviteAccept.channelPending') });
            latest.current.enterStack('deeplink', ROUTES.home);
        },
        [code]
    );

    const advance = useCallback(async () => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setPhase('submitting');
        const trace = beginInviteAcceptTrace('relay');

        let view: RelayInviteInfo;
        try {
            await awaitRelaySocket();
            view = await callOnRelay(
                'advance',
                () => latest.current.mutations.getInvite(code),
                () => !isStale(run)
            );
        } catch (error) {
            if (isStale(run)) return;
            const status = getSocketErrorCode(error);
            logger.error('INVITE', `[useRelayInviteFlow] invite.get failed on advance (status=${status ?? '-'})`, {
                error,
            });
            trace.end('error', { step: 'read-invite' });
            return fail(resolveNotice(status, 'get'));
        }
        if (isStale(run)) return;
        trace.mark('invite_read');
        setInvite(view);

        if (view.state === 'expired') return failTerminalState('expired', 'expired', 'advance', trace);
        if (view.state === 'accepted') return failTerminalState('accepted', 'alreadyJoined', 'advance', trace);
        if (view.state === 'canceled') return failTerminalState('canceled', 'inviteCanceled', 'advance', trace);
        if (view.state === 'rejected') return failTerminalState('rejected', 'rejected', 'advance', trace);

        if (runtime.session.getGlobalSessionContext().activeServer.kind === 'cloud') {
            try {
                await latest.current.logoutCloudSession();
            } catch (error) {
                logger.warn('INVITE', '[useRelayInviteFlow] could not return to relay before accepting', { error });
            }
            if (isStale(run)) return;
        }

        if (view.needVerify) {
            if (verifiedRef.current) {
                trace.end('notice');
                return fail('wrongNumber');
            }
            if (latest.current.verifyMode === 'link' && !view.last4) {
                trace.end('error', { step: 'verify' });
                return fail('generic');
            }
            trace.end('verify');
            return setPhase('verifying');
        }

        const needsProfile =
            !profileSavedRef.current &&
            !profileSkippedRef.current &&
            !!runtime.session.getGlobalSessionContext().activeServer.siteId &&
            (await isPlaceProfileAbsent(latest.current.profileRepository));
        if (isStale(run)) return;
        if (needsProfile) {
            trace.end('profile');
            return setPhase('profiling');
        }

        let acceptedChannelId: string | undefined;
        try {
            const accepted = await callOnRelay(
                'accept',
                () => latest.current.mutations.acceptInvite(code),
                () => !isStale(run)
            );
            if (isStale(run)) return;
            if (accepted.state !== 'accepted') {
                logger.error('INVITE', 'invite.accept returned non-accepted state', {
                    data: { state: accepted.state },
                });
                trace.end('error', { step: 'accept' });
                return fail('generic');
            }
            trace.mark('accepted');
            setInvite(prev => ({ ...prev, ...accepted }));
            acceptedChannelId = accepted.channelId;
        } catch (error) {
            if (isStale(run)) return;
            const status = getSocketErrorCode(error);
            if (status === 403 && !verifiedRef.current) {
                logger.info(
                    'INVITE',
                    '[useRelayInviteFlow] invite accept refused as main user; routing to verification'
                );
                setRefusedAsMainUser(true);
                trace.end('verify');
                return setPhase('verifying');
            }
            logger.error('INVITE', `[useRelayInviteFlow] invite.accept failed (status=${status ?? '-'})`, { error });
            trace.end('error', { step: 'accept' });
            return fail(resolveNotice(status, 'accept'));
        }

        await enterChannel(run, trace, acceptedChannelId, view.inviterId);
    }, [code, fail, failTerminalState, enterChannel]);

    useEffect(() => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setPhase('loading');

        void (async () => {
            try {
                await awaitRelaySocket();
                const view = await callOnRelay(
                    'entry',
                    () => latest.current.mutations.getInvite(code),
                    () => !isStale(run)
                );
                if (isStale(run)) return;
                setInvite(view);
                if (view.state === 'expired') return failTerminalState('expired', 'expired', 'entry');
                if (view.state === 'accepted') return failTerminalState('accepted', 'alreadyJoined', 'entry');
                if (view.state === 'canceled') return failTerminalState('canceled', 'inviteCanceled', 'entry');
                if (view.state === 'rejected') return failTerminalState('rejected', 'rejected', 'entry');
                setPhase('review');
            } catch (error) {
                if (isStale(run)) return;
                const status = getSocketErrorCode(error);
                logger.error('INVITE', `[useRelayInviteFlow] invite.get failed on entry (status=${status ?? '-'})`, {
                    error,
                });
                fail(resolveNotice(status, 'get'));
            }
        })();
    }, [code, fail, failTerminalState, attempt]);

    useEffect(() => {
        if (phase === 'review' && countdown?.isExpired) fail('expired');
    }, [phase, countdown?.isExpired, fail]);

    const onVerified = useCallback(() => {
        verifiedRef.current = true;
        profileSavedRef.current = false;
        void advance();
    }, [advance]);

    const onProfileSaved = useCallback(() => {
        profileSavedRef.current = true;
        void advance();
    }, [advance]);

    const skipProfile = useCallback(() => {
        profileSkippedRef.current = true;
        void advance();
    }, [advance]);

    const decline = useCallback(() => {
        setPhase('declining');
    }, []);

    const confirmDecline = useCallback(async () => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setIsRejecting(true);
        try {
            const view = await latest.current.mutations.rejectInvite(code);
            if (isStale(run)) return;
            if (view.state !== 'rejected') {
                setIsRejecting(false);
                return fail('generic');
            }
            latest.current.toast({ title: latest.current.t('relayInviteAccept.declinedToast') });
            goHome();
        } catch (error) {
            if (isStale(run)) return;
            setIsRejecting(false);
            const status = getSocketErrorCode(error);
            logger.error('INVITE', `[useRelayInviteFlow] invite.reject failed (status=${status ?? '-'})`, { error });
            return fail(resolveNotice(status, 'reject'));
        }
    }, [code, fail, goHome]);

    const close = useCallback(() => {
        if (phase === 'submitting' || phase === 'awaitingChannel') return;
        goHome();
    }, [phase, goHome]);

    return {
        phase,
        invite,
        notice,
        countdown,
        verifyMode,
        accept: useCallback(() => void advance(), [advance]),
        decline,
        confirmDecline: useCallback(() => void confirmDecline(), [confirmDecline]),
        isRejecting,
        close,
        onVerified,
        onProfileSaved,
        skipProfile,
        cancelStep: useCallback(() => setPhase('review'), []),
        dismissNotice: useCallback(() => {
            if (!noticeOpenRef.current) return;
            goHome();
        }, [goHome]),
        retry: useCallback(() => {
            noticeOpenRef.current = false;
            setNotice(null);
            setAttempt(n => n + 1);
        }, []),
    };
};
