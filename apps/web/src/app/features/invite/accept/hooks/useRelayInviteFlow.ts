import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSocketManager, useRuntimeProfile, useRuntimeRepositories } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useSessionSelection } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { AccountLinkMode } from '../../../../hooks/useLinkAccount';
import { useInviteCountdown, type InviteCountdown } from '../../hooks/useInviteCountdown';
import { useResolveInviteChannel } from './useResolveInviteChannel';
import { useRelayInviteMutations, type RelayInviteView } from '../../../../hooks';
import { usePendingInviteChannel } from '../../../../stores/usePendingInviteChannel';
import type { InviteInfo } from '../types';
import { getSocketErrorCode } from '../../../../utils/errors';
import { isPlaceProfileAbsent } from '../../../../utils/placeProfile';
import { ROUTES } from '../../../../routes/paths';

/**
 * The invite as the accept screen reads it. `expiredAt`, the inviter's avatar and the place's
 * intro/thumbnail arrive at runtime but are not on the published view — the same extension point the
 * cloud flow uses (see InviteInfo). `site$.name` IS published; only the two extras are runtime-only.
 */
export type RelayInviteInfo = RelayInviteView & Pick<InviteInfo, 'expiredAt' | 'inviter$' | 'site$'>;

/** Where the accept flow currently is. See the state diagram in the feature doc. */
export type RelayInvitePhase =
    /** initial `invite.get` */
    | 'loading'
    /** the accept screen */
    | 'review'
    /** the decline-confirm dialog is up (rejecting is final — 05-client-guide §B-4) */
    | 'declining'
    /** re-validating and/or accepting — the CTA spins */
    | 'submitting'
    /** phone verification (Track A's PhoneVerifyScreen) */
    | 'verifying'
    /** place-profile setup — only when the place has none (ADR-0041) */
    | 'profiling'
    /** accepted; waiting for the asynchronously created DM room */
    | 'awaitingChannel'
    /** terminal: a notice dialog is up */
    | 'notice'
    /** terminal: we navigated away */
    | 'closed';

/**
 * Terminal notices, mapped from the server's `state` / `errorCode` — never from message text.
 * Each value keys the copy at `inviteAccept.dialog.${notice}`; `inviteCanceled` is the key ADR-0016
 * prepared (Figma 3079-12304), live again now that `canceled` arrives as a state (ADR-0043).
 */
export type RelayInviteNotice =
    | 'expired'
    | 'alreadyJoined'
    | 'inviteCanceled'
    | 'rejected'
    | 'notFound'
    | 'wrongNumber'
    | 'taken'
    | 'generic';

/**
 * Which notice a failed packet becomes. `stage` matters because the same status means different
 * things on either side of the flow (05-client-guide §에러 코드).
 *
 * `404` is purely "no such invite" — a canceled one arrives as `state === 'canceled'` (ADR-0043),
 * not as an error, so the old merged copy is gone.
 */
const resolveNotice = (status: number | undefined, stage: 'get' | 'accept' | 'reject'): RelayInviteNotice => {
    if (status === 404) return 'notFound';
    // Rejecting has exactly one 409 — `reject-invite.ts` throws it only for an already-accepted
    // invite — and a relay 1:1 code is bound to one phone hash, so the only party who could have
    // accepted it is this same person on another device. "Someone else got there first" (`taken`)
    // would be plainly false; they are already in the room.
    if (status === 409) return stage === 'reject' ? 'alreadyJoined' : 'taken';
    // Reading: a malformed code. Accepting: the invite expired between the check and the accept.
    if (status === 400) return stage === 'accept' ? 'expired' : 'notFound';
    // Reading answers 403 for a code that does not match the invite it names (`find-model-by-code`),
    // which is the same thing as an invalid link. Accepting answers it for a guest — caught by the
    // caller's own branch before this — or a number that is not the invited one.
    if (status === 403) return stage === 'accept' ? 'wrongNumber' : 'notFound';
    return 'generic';
};

/** Same bound the other deeplink entry points use for the socket handshake (see usePushNavigate). */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

/**
 * Hold until the RELAY slot has finished its handshake.
 *
 * An invite deeplink is the one entry that lands during boot: guest login → relay token → connect →
 * `device.save` → `auth.update` all run while home is already mounting this flow. `invite.get` is a
 * relay-pinned packet, so firing it early rejects with an unclassified failure — `[SocketManager] no
 * relay slot bound`, `503 SOCKET NOT CONNECTED`, `401 UNAUTHORIZED` — none of which `resolveNotice`
 * can map, so the user got the useless "generic" dialog on a perfectly valid invite.
 *
 * Kind-pinned, not `waitUntilVerified`: that one tracks the ACTIVE slot, which is cloud whenever a
 * cloud session is up, and would let a relay request through mid-handshake.
 *
 * Best-effort — a timeout still proceeds, so a genuinely broken socket surfaces the server's own
 * error rather than being swallowed as a wait.
 */
const awaitRelaySocket = async (): Promise<void> => {
    const verified = await getSocketManager().waitUntilKindVerified('relay', HANDSHAKE_WAIT_TIMEOUT_MS);
    if (verified) return;
    logger.warn('INVITE', '[useRelayInviteFlow] relay handshake not verified; proceeding best-effort');
};

export interface RelayInviteFlow {
    phase: RelayInvitePhase;
    invite: RelayInviteInfo | null;
    notice: RelayInviteNotice | null;
    countdown: InviteCountdown | null;
    /**
     * Which proof the `verifying` phase runs. Opening a deeplink does NOT imply a device session —
     * an already-authenticated main user with no phone yet still gets `needVerify`, and sending
     * `login` from that session is a 400 (`@mode[login] is for device session`). See the derivation.
     */
    verifyMode: AccountLinkMode;
    /** "수락" — runs the next step, always re-validating first. */
    accept: () => void;
    /** "거절" — opens the confirm dialog (`declining`); rejecting is final, so it never fires directly. */
    decline: () => void;
    /** Confirm on the decline dialog — the actual `invite.reject` (ADR-0043). */
    confirmDecline: () => void;
    /**
     * True while `confirmDecline`'s request is in flight. Stays in the `declining` phase rather than
     * moving to `submitting` — the accept screen (and its "수락" spinner) is not what is happening —
     * so the confirm dialog itself carries the pending state, same idiom as `InviteWaitingPage`'s
     * cancel-confirm dialog (`isPending`/`isCanceling`).
     */
    isRejecting: boolean;
    /** Dismiss (X / esc / overlay) — blocked while a step is in flight. */
    close: () => void;
    /** Phone verification finished; the session is already the main user. */
    onVerified: () => void;
    /** The place profile was saved. */
    onProfileSaved: () => void;
    /** The user backed out of verification / profile setup / the decline-confirm dialog. */
    cancelStep: () => void;
    /** Confirm on the notice dialog. */
    dismissNotice: () => void;
    /**
     * Re-run the flow from the invite read. Offered on `generic` only — every other notice is a
     * verdict about the invite itself, which retrying cannot change.
     */
    retry: () => void;
}

/**
 * The relay 1:1 invite accept state machine (ADR-0033 D10, restored by ADR-0041 after ADR-0039):
 * `invite.get` → phone verification if needed → place profile if missing → `invite.accept` → wait for
 * the DM room → enter it.
 *
 * Every step transition goes through `advance`, whose first act is another `invite.get`. That is not
 * defensiveness for its own sake — verifying a phone number takes minutes, and an invite that expires
 * or gets claimed in the meantime must surface as a notice rather than a confusing accept failure
 * (05-client-guide §B-2). Routing every entry point through one function is what makes that re-check
 * impossible to forget.
 *
 * Success is `state === 'accepted'`; there is no success flag. Re-accepting the same code is safe, so
 * a retry after a dropped connection costs nothing.
 */
export const useRelayInviteFlow = (code: string): RelayInviteFlow => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const mutations = useRelayInviteMutations();
    const { resolveChannel } = useResolveInviteChannel();
    const { profile: profileRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid } = useSessionSelection();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const [phase, setPhase] = useState<RelayInvitePhase>('loading');
    const [invite, setInvite] = useState<RelayInviteInfo | null>(null);
    const [notice, setNotice] = useState<RelayInviteNotice | null>(null);
    const [isRejecting, setIsRejecting] = useState(false);
    /**
     * Set when the SERVER itself refused us as a main user (a 403 on accept). The role cache can
     * disagree with the server — it falls back to "main user" when the role is simply unknown, and
     * reads the cloud token while a cloud is active — so once the server has spoken, its verdict
     * outranks `isGuest`. Same override, and the same reasoning, as ContactInvitePage's 403 net.
     */
    const [refusedAsMainUser, setRefusedAsMainUser] = useState(false);

    const { isGuest } = useRuntimeProfile();
    // A guest must OPEN a session (`login`); a main user who merely lacks a phone hangs one on the
    // session they already have (`link`) — sending `login` there is a 400 (ADR-0042 §3).
    const verifyMode: AccountLinkMode = isGuest || refusedAsMainUser ? 'login' : 'link';

    const countdown = useInviteCountdown(invite?.expiredAt);

    // Latest-value refs: the async steps read these long after the closure was created, and keeping
    // them out of the callback deps stops `advance` from churning identity on every render.
    const latest = useRef({
        mutations,
        resolveChannel,
        setPendingChannel,
        profileRepository,
        sid,
        navigate,
        toast,
        t,
        verifyMode,
    });
    latest.current = {
        mutations,
        resolveChannel,
        setPendingChannel,
        profileRepository,
        sid,
        navigate,
        toast,
        t,
        verifyMode,
    };

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

    // Whether the profile step already completed in this flow. Without it the re-entry after a save
    // would re-judge, and `profile.set` may not be readable back yet — which would bounce the user
    // into the same form a second time.
    const profileSavedRef = useRef(false);

    // Bumped by `retry` to re-run the entry read; a plain function call cannot restart an effect.
    const [attempt, setAttempt] = useState(0);

    // Whether the notice dialog is the thing on screen. The dialog fires its `onOpenChange(false)`
    // synchronously right after the confirm callback, and reads that as a dismiss — so on retry it
    // would navigate home out from under the restarted read. `phase` cannot arbitrate that (the
    // setState has not landed yet), hence a ref the retry clears in the same tick.
    const noticeOpenRef = useRef(false);

    const goHome = useCallback(() => {
        runIdRef.current += 1;
        noticeOpenRef.current = false;
        setPhase('closed');
        latest.current.navigate(ROUTES.home, { replace: true });
    }, []);

    const fail = useCallback((next: RelayInviteNotice) => {
        noticeOpenRef.current = true;
        setNotice(next);
        setPhase('notice');
    }, []);

    /**
     * The four terminal states arrive as `state` rather than as errors (ADR-0043), so they slip past
     * every catch in this file and used to leave no record at all. `warn`, not `error`: the invite
     * lapsing or having been used already is an ordinary ending, not a malfunction.
     */
    const failTerminalState = useCallback(
        (state: string, next: RelayInviteNotice, stage: 'entry' | 'advance') => {
            logger.warn('INVITE', `[useRelayInviteFlow] invite in terminal state: ${state}`, { stage });
            return fail(next);
        },
        [fail]
    );

    /**
     * Accepted: resolve the room the accept created, then hand off to home's channel entry.
     *
     * `acceptedChannelId` is tier 1 of the resolution (ADR-0035) — when the accept response already
     * carried the room there is nothing to wait for, so the spinner phase is skipped entirely.
     */
    const enterChannel = useCallback(
        async (run: number, acceptedChannelId?: string) => {
            if (!acceptedChannelId) setPhase('awaitingChannel');

            const channelId = await latest.current.resolveChannel(code, { acceptedChannelId });
            if (isStale(run)) return;

            if (channelId) latest.current.setPendingChannel(channelId);
            // Unresolved: the accept is already on the server, so the room will show up in the list on the
            // next background sync. Say so rather than leaving the user on a spinner.
            else latest.current.toast({ title: latest.current.t('relayInviteAccept.channelPending') });

            logger.info('INVITE', 'relay invite accepted; entering channel', { channelId, resolved: !!channelId });
            setPhase('closed');
            latest.current.navigate(ROUTES.home, { replace: true });
        },
        [code]
    );

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
            await awaitRelaySocket();
            view = await latest.current.mutations.getInvite(code);
        } catch (error) {
            if (isStale(run)) return;
            const status = getSocketErrorCode(error);
            logger.error('INVITE', `[useRelayInviteFlow] invite.get failed on advance (status=${status ?? '-'})`, {
                error,
            });
            return fail(resolveNotice(status, 'get'));
        }
        if (isStale(run)) return;
        setInvite(view);

        if (view.state === 'expired') return failTerminalState('expired', 'expired', 'advance');
        if (view.state === 'accepted') return failTerminalState('accepted', 'alreadyJoined', 'advance');
        // Same final-state branches as the entry read — verification takes minutes, and the
        // inviter can retire the code in that window.
        if (view.state === 'canceled') return failTerminalState('canceled', 'inviteCanceled', 'advance');
        if (view.state === 'rejected') return failTerminalState('rejected', 'rejected', 'advance');

        // Verify, then name yourself, then accept (ADR-0033 D10, restored by ADR-0041 over
        // ADR-0039 decision 5). Verification comes first because the profile belongs to the promoted
        // main user's site — while still a device user there is no site to write it to.
        //
        // `verifiedRef` makes this a ONE-shot step. The server derives `needVerify` from whether this
        // account owns the invited number, so proving a DIFFERENT number leaves it true — and without
        // this guard the flow would bounce straight back here, remounting the verify screen as a
        // blank form with no error, forever. A number already linked cannot be swapped either (the
        // backend has no unlink and answers `type-linked`), so re-verifying could never clear it:
        // the honest answer is the terminal notice.
        if (view.needVerify) {
            if (verifiedRef.current) return fail('wrongNumber');
            // Cross-check BEFORE the proof, never after — a `link` confirm COMMITS the number to this
            // account, and the backend has no unlink (`judgeLink` answers `type-linked` forever), so a
            // wrong number linked here is permanent and takes the invite with it.
            //
            // `login` gets that check from the server: the invite code rides along and
            // `assertInviteMatched` runs before a message is ever dispatched. `link` structurally
            // cannot — `link-account.ts` reads the code only when `mode === 'login'` — which leaves
            // `last4` (enforced in usePhoneVerify) as the only cross-check on this path. With no
            // `last4` there is nothing to check against at all, so refuse rather than let an
            // unverifiable number be written irreversibly.
            if (latest.current.verifyMode === 'link' && !view.last4) return fail('generic');
            return setPhase('verifying');
        }

        // The profile is a PRECONDITION of the accept, not a gate on the app: backing out returns to
        // the review screen without accepting, so "accepted but nameless" — which a force-quit right
        // after the accept would otherwise leave behind, irreversibly — cannot happen. Awaited and
        // fail-open; see isPlaceProfileAbsent.
        // `!sid` skips the step deliberately. `setMyProfile` asserts a site id, and NOTHING on this
        // route establishes one: the relay sid is a plain read of `chatic-relay-selected-site-id`,
        // written only by an explicit place switch (`useSwitchPlace`, mounted on home). Auth does not
        // set it, and in a browser `storage` is sessionStorage — so an SMS link opened in a fresh tab
        // has no sid even for a long-time user. Gating there would throw inside the dialog and leave the
        // invite permanently unacceptable, since the profile is a precondition of the accept. The same
        // flow already defends this way (`useAwaitInviteChannel`: `if (!sid) return null`).
        const needsProfile =
            !profileSavedRef.current &&
            !!latest.current.sid &&
            (await isPlaceProfileAbsent(latest.current.profileRepository));
        if (isStale(run)) return;
        if (needsProfile) return setPhase('profiling');

        let acceptedChannelId: string | undefined;
        try {
            const accepted = await latest.current.mutations.acceptInvite(code);
            if (isStale(run)) return;
            // `state` is the only success signal the response carries.
            if (accepted.state !== 'accepted') {
                logger.error('INVITE', 'invite.accept returned non-accepted state', {
                    data: { state: accepted.state },
                });
                return fail('generic');
            }
            setInvite(prev => ({ ...prev, ...accepted }));
            // May be absent — the room is created asynchronously (ADR-0035 tier 1).
            acceptedChannelId = accepted.channelId;
        } catch (error) {
            if (isStale(run)) return;
            const status = getSocketErrorCode(error);
            // Not yet a main user: the server re-judges regardless of `needVerify`, so send them to
            // verification instead of dead-ending. Once verified, a 403 really is a number mismatch.
            //
            // The server just told us it does NOT see a main user, which beats whatever the role
            // cache believes — so pin the proof to `login`. Without this the flow would re-derive
            // `link` from a stale `isGuest: false` and the send would 403 again, with no way out.
            if (status === 403 && !verifiedRef.current) {
                logger.info(
                    'INVITE',
                    '[useRelayInviteFlow] invite accept refused as main user; routing to verification'
                );
                setRefusedAsMainUser(true);
                return setPhase('verifying');
            }
            logger.error('INVITE', `[useRelayInviteFlow] invite.accept failed (status=${status ?? '-'})`, { error });
            return fail(resolveNotice(status, 'accept'));
        }

        await enterChannel(run, acceptedChannelId);
    }, [code, fail, failTerminalState, enterChannel]);

    // Entry read. Unlike `advance` this stops at the accept screen — the user has not chosen yet.
    useEffect(() => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        setPhase('loading');

        void (async () => {
            try {
                // The gate matters most here: this is the one read that races the app's cold boot.
                await awaitRelaySocket();
                const view = await latest.current.mutations.getInvite(code);
                if (isStale(run)) return;
                setInvite(view);
                if (view.state === 'expired') return failTerminalState('expired', 'expired', 'entry');
                if (view.state === 'accepted') return failTerminalState('accepted', 'alreadyJoined', 'entry');
                // Final states arrive as `state`, not as errors (ADR-0043): canceled by the
                // inviter, or rejected by this number on an earlier open.
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
        // `attempt` is the retry trigger — re-running this effect IS the retry.
    }, [code, fail, failTerminalState, attempt]);

    // The link can lapse while the accept screen is open — the countdown is the only thing watching.
    useEffect(() => {
        if (phase === 'review' && countdown?.isExpired) fail('expired');
    }, [phase, countdown?.isExpired, fail]);

    const onVerified = useCallback(() => {
        verifiedRef.current = true;
        // Re-judge the profile. After a `login` proof the identity was swapped, so a profile saved as
        // the device user says nothing about the promoted user's site — without this the
        // `403 → verifying` fallback could accept as a user who has no profile, the very state this
        // step exists to prevent. A `link` proof leaves the identity alone and so needs no reset, but
        // paying for one re-read there is cheaper than making the reset conditional on a mode the
        // server can still overrule.
        profileSavedRef.current = false;
        void advance();
    }, [advance]);

    const onProfileSaved = useCallback(() => {
        profileSavedRef.current = true;
        void advance();
    }, [advance]);

    // Rejecting is final and needs no verification (05-client-guide §B-4) — but exactly because it
    // is final, the button only raises the confirm dialog; the actual packet waits for the confirm.
    const decline = useCallback(() => {
        setPhase('declining');
    }, []);

    const confirmDecline = useCallback(async () => {
        runIdRef.current += 1;
        const run = runIdRef.current;
        // Stays in `declining` — the confirm dialog owns this pending state (`isRejecting`), same
        // idiom as InviteWaitingPage's cancel-confirm dialog. Moving to `submitting` would unmount
        // the dialog behind the accept screen's own spinner, which is not what is happening here.
        setIsRejecting(true);
        try {
            const view = await latest.current.mutations.rejectInvite(code);
            if (isStale(run)) return;
            // `state` is the only success signal, same as accept. Idempotent server-side.
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
            // 409 → alreadyJoined: the only way a reject conflicts is that the invite was already
            // accepted, and only this number's owner could have done that. The rest reads like the
            // entry lookup — a reject carries no verification stage of its own.
            return fail(resolveNotice(status, 'reject'));
        }
    }, [code, fail, goHome]);

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
        verifyMode,
        accept: useCallback(() => void advance(), [advance]),
        decline,
        confirmDecline: useCallback(() => void confirmDecline(), [confirmDecline]),
        isRejecting,
        close,
        onVerified,
        onProfileSaved,
        cancelStep: useCallback(() => setPhase('review'), []),
        // Only closes while the notice is genuinely up, so the dismiss the dialog fires on its way
        // out of a retry cannot send the user home mid-read.
        dismissNotice: useCallback(() => {
            if (!noticeOpenRef.current) return;
            goHome();
        }, [goHome]),
        // Back to the entry read rather than resuming the failed step: a `generic` means we could not
        // classify what went wrong, so the invite's current state is exactly what we need to re-establish.
        retry: useCallback(() => {
            noticeOpenRef.current = false;
            setNotice(null);
            setAttempt(n => n + 1);
        }, []),
    };
};
