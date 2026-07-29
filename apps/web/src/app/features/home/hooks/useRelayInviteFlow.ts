import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useInviteCountdown, type InviteCountdown } from './useInviteCountdown';
import { useAwaitInviteChannel, useMyProfile, useRelayInviteMutations, type RelayInviteView } from '../../../hooks';
import { recordDeclinedInvite } from '../lib';
import { usePendingInviteChannel } from '../../../stores/usePendingInviteChannel';
import type { InviteInfo } from '../types';
import { getSocketErrorCode } from '../../../utils/errors';
import { ROUTES } from '../../../routes/paths';

/**
 * The invite as the accept screen reads it. `expiredAt` and the inviter's avatar arrive at runtime
 * but are not on the published view — the same extension point the cloud flow uses (see InviteInfo).
 */
export type RelayInviteInfo = RelayInviteView & Pick<InviteInfo, 'expiredAt' | 'inviter$'>;

/** Where the accept flow currently is. See the state diagram in the feature doc. */
export type RelayInvitePhase =
    /** initial `invite.get` */
    | 'loading'
    /** the accept screen */
    | 'review'
    /** re-validating and/or accepting — the CTA spins */
    | 'submitting'
    /** phone verification (Track A's PhoneVerifyScreen) */
    | 'verifying'
    /** place-profile setup */
    | 'profiling'
    /** accepted; waiting for the asynchronously created DM room */
    | 'awaitingChannel'
    /** terminal: a notice dialog is up */
    | 'notice'
    /** terminal: we navigated away */
    | 'closed';

/** Terminal notices, mapped from the server's `state` / `errorCode` — never from message text. */
export type RelayInviteNotice = 'expired' | 'alreadyJoined' | 'notFound' | 'wrongNumber' | 'taken' | 'generic';

/**
 * Which notice a failed packet becomes. `stage` matters because the same status means different
 * things on either side of the flow (05-client-guide §에러 코드).
 *
 * `404` covers both a cancelled and a never-existed invite: there is no cancel API and therefore no
 * `canceled` state to tell them apart (backend request 1), so the copy is deliberately merged.
 */
const resolveNotice = (status: number | undefined, stage: 'get' | 'accept'): RelayInviteNotice => {
    if (status === 404) return 'notFound';
    if (status === 409) return 'taken';
    // Reading: a malformed code. Accepting: the invite expired between the check and the accept.
    if (status === 400) return stage === 'accept' ? 'expired' : 'notFound';
    if (status === 403) return stage === 'accept' ? 'wrongNumber' : 'notFound';
    return 'generic';
};

export interface RelayInviteFlow {
    phase: RelayInvitePhase;
    invite: RelayInviteInfo | null;
    notice: RelayInviteNotice | null;
    countdown: InviteCountdown | null;
    /** "수락" — runs the next step, always re-validating first. */
    accept: () => void;
    /** "거절" — a stub: closes and remembers locally (backend request 2). */
    decline: () => void;
    /** Dismiss (X / esc / overlay) — blocked while a step is in flight. */
    close: () => void;
    /** Phone verification finished; the session is already the main user. */
    onVerified: () => void;
    /** The place profile was saved. */
    onProfileSaved: () => void;
    /** The user backed out of verification / profile setup. */
    cancelStep: () => void;
    /** Confirm on the notice dialog. */
    dismissNotice: () => void;
}

/**
 * The relay 1:1 invite accept state machine (ADR-0033 D10):
 * `invite.get` → phone verification if needed → place profile if missing → `invite.accept` →
 * wait for the DM room → enter it.
 *
 * Every step transition goes through `advance`, whose first act is another `invite.get`. That is not
 * defensiveness for its own sake — verifying a phone number takes minutes, and an invite that expires
 * or gets claimed in the meantime must surface as a notice rather than a confusing accept failure
 * (05-client-guide §B-2). Routing all three entry points through one function is what makes that
 * re-check impossible to forget.
 *
 * Success is `state === 'accepted'`; there is no success flag. Re-accepting the same code is safe, so
 * a retry after a dropped connection costs nothing.
 */
export const useRelayInviteFlow = (code: string): RelayInviteFlow => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const mutations = useRelayInviteMutations();
    const { profile } = useMyProfile();
    const { awaitChannel } = useAwaitInviteChannel();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const [phase, setPhase] = useState<RelayInvitePhase>('loading');
    const [invite, setInvite] = useState<RelayInviteInfo | null>(null);
    const [notice, setNotice] = useState<RelayInviteNotice | null>(null);

    const countdown = useInviteCountdown(invite?.expiredAt);

    // Latest-value refs: the async steps read these long after the closure was created, and keeping
    // them out of the callback deps stops `advance` from churning identity on every render.
    const latest = useRef({ mutations, nick: profile?.nick, awaitChannel, setPendingChannel, navigate, toast, t });
    latest.current = { mutations, nick: profile?.nick, awaitChannel, setPendingChannel, navigate, toast, t };

    // Generation counter: a step that resolves after the flow moved on (or unmounted) must not write.
    const runIdRef = useRef(0);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);
    const isStale = (run: number) => !aliveRef.current || runIdRef.current !== run;

    // Whether phone verification already succeeded in this flow. A 403 on accept normally means "you
    // are still the device user" and should route to verification — but after a successful
    // verification it means the number verified is not the invited one, which is terminal.
    const verifiedRef = useRef(false);

    const goHome = useCallback(() => {
        runIdRef.current += 1;
        setPhase('closed');
        latest.current.navigate(ROUTES.home, { replace: true });
    }, []);

    const fail = useCallback((next: RelayInviteNotice) => {
        setNotice(next);
        setPhase('notice');
    }, []);

    /** Accepted: hold on the spinner until the room shows up, then hand off to home's channel entry. */
    const enterChannel = useCallback(async (run: number) => {
        setPhase('awaitingChannel');
        const channelId = await latest.current.awaitChannel();
        if (isStale(run)) return;

        if (channelId) latest.current.setPendingChannel(channelId);
        // Timed out: the accept is already on the server, so the room will show up in the list on the
        // next background sync. Say so rather than leaving the user on a spinner.
        else latest.current.toast({ title: latest.current.t('relayInviteAccept.channelPending') });

        setPhase('closed');
        latest.current.navigate(ROUTES.home, { replace: true });
    }, []);

    /**
     * Re-validate, then take exactly one step forward. Called by the accept button and by every step
     * that completes, so the re-validation is structural rather than remembered.
     */
    const advance = useCallback(async () => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setPhase('submitting');

        let view: RelayInviteInfo;
        try {
            view = await latest.current.mutations.getInvite(code);
        } catch (error) {
            if (isStale(run)) return;
            return fail(resolveNotice(getSocketErrorCode(error), 'get'));
        }
        if (isStale(run)) return;
        setInvite(view);

        if (view.state === 'expired') return fail('expired');
        if (view.state === 'accepted') return fail('alreadyJoined');

        // Order is fixed by ADR-0033 D10: verify, then profile, then accept.
        if (view.needVerify) return setPhase('verifying');
        if (!latest.current.nick) return setPhase('profiling');

        try {
            const accepted = await latest.current.mutations.acceptInvite(code);
            if (isStale(run)) return;
            // `state` is the only success signal the response carries.
            if (accepted.state !== 'accepted') return fail('generic');
            setInvite(prev => ({ ...prev, ...accepted }));
        } catch (error) {
            if (isStale(run)) return;
            const status = getSocketErrorCode(error);
            // Not yet a main user: the server re-judges regardless of `needVerify`, so send them to
            // verification instead of dead-ending. Once verified, a 403 really is a number mismatch.
            if (status === 403 && !verifiedRef.current) return setPhase('verifying');
            return fail(resolveNotice(status, 'accept'));
        }

        await enterChannel(run);
    }, [code, fail, enterChannel]);

    // Entry read. Unlike `advance` this stops at the accept screen — the user has not chosen yet.
    useEffect(() => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setPhase('loading');

        void (async () => {
            try {
                const view = await latest.current.mutations.getInvite(code);
                if (isStale(run)) return;
                setInvite(view);
                if (view.state === 'expired') return fail('expired');
                if (view.state === 'accepted') return fail('alreadyJoined');
                setPhase('review');
            } catch (error) {
                if (isStale(run)) return;
                fail(resolveNotice(getSocketErrorCode(error), 'get'));
            }
        })();
    }, [code, fail]);

    // The link can lapse while the accept screen is open — the countdown is the only thing watching.
    useEffect(() => {
        if (phase === 'review' && countdown?.isExpired) fail('expired');
    }, [phase, countdown?.isExpired, fail]);

    const onVerified = useCallback(() => {
        verifiedRef.current = true;
        void advance();
    }, [advance]);

    const decline = useCallback(() => {
        // TODO(backend): 2번 — ADR-0033 인터페이스 선반영. No reject API and no `rejected` state, so
        // this only closes and remembers locally; the inviter is never told.
        recordDeclinedInvite(invite?.id);
        goHome();
    }, [invite?.id, goHome]);

    const close = useCallback(() => {
        // Never mid-step: dismissing there would strip the URL and swallow the outcome.
        if (phase === 'submitting' || phase === 'awaitingChannel') return;
        goHome();
    }, [phase, goHome]);

    return {
        phase,
        invite,
        notice,
        countdown,
        accept: useCallback(() => void advance(), [advance]),
        decline,
        close,
        onVerified,
        onProfileSaved: useCallback(() => void advance(), [advance]),
        cancelStep: useCallback(() => setPhase('review'), []),
        dismissNotice: goHome,
    };
};
