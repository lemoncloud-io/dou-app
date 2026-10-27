import type { PairingClaimView, PairingRequestView, PairingTarget } from '@chatic/http';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * Where a code request stands, as the code screen draws it.
 *
 * - `requesting` — asking the relay for a code.
 * - `waiting` — the code is on screen and the flow polls `claim`.
 * - `applying` — approved; the session (relay) or the cloud switch (cloud) is being applied.
 * - `done` — signed in. `target` says which scope the approval gave, so the screen can word it.
 * - `expired` · `denied` — the code ran out or the approving device refused it. A new code starts over.
 * - `lost` — approved, but the session could not be taken or applied (another claim already took it,
 *   the approval was revoked, or applying it threw). It cannot be fetched again, so it starts over too.
 * - `failed` — the request itself was refused.
 */
export type PairingRequestState =
    | { phase: 'requesting' }
    | { phase: 'waiting'; code: string; expiredAt: number; pairingId: string }
    | { phase: 'applying'; target: PairingTarget }
    | { phase: 'done'; target: PairingTarget; approverName?: string }
    | { phase: 'expired'; code: string }
    | { phase: 'denied' }
    | { phase: 'lost' }
    | { phase: 'failed'; status?: number };

export interface PairingRequestFlowDeps {
    request(): Promise<PairingRequestView>;
    claim(pairingId: string): Promise<PairingClaimView>;
    /** Applies a relay approval's session — `runtime.session.applySessionToken`. Throws when it cannot. */
    applySession(session: UserTokenView): Promise<void>;
    /** Enters a cloud approval as a guest — the cloud switch, plus remembering the cloud. Throws on failure. */
    enterCloud(cloudId: string): Promise<void>;
    onChange(state: PairingRequestState): void;
    now?: () => number;
    schedule?: (run: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
}

export interface PairingRequestFlow {
    /** Starts a request, or — when one is already under way — resumes polling it. */
    start(): void;
    /** Stops scheduling claims. A claim already in flight still finishes, approval and all. */
    stop(): void;
    /** Drops the current code and asks for a new one. */
    restart(): void;
    getState(): PairingRequestState;
}

/** The HTTP status of a failed call, from whichever shape the transport rejected with. */
export const pairingErrorStatus = (error: unknown): number | undefined => {
    const e = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null;
    const status = e?.status ?? e?.response?.status ?? e?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

/** The server's reason text (`400 BAD REQUEST - pairing expired`), wherever the transport put it. */
export const pairingErrorReason = (error: unknown): string => {
    const e = error as { message?: unknown; response?: { data?: unknown } } | null;
    const data = e?.response?.data;
    const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    return `${typeof e?.message === 'string' ? e.message : ''} ${text}`.toLowerCase();
};

/**
 * The requesting device's side of a pairing, without React: request a code, poll `claim` until there is
 * an outcome, and apply the approval.
 *
 * **One claim at a time, and an approval is never dropped.** A relay approval's session rides the first
 * `approved` answer only — the server answers `claimed` afterwards — so a second claim in flight, or an
 * answer thrown away because the screen went away, loses the sign-in for good. The loop therefore sends
 * the next claim only after the previous one settled, `start` after `stop` resumes the same loop instead
 * of opening another (React's strict-mode double mount), and `stop` only stops *scheduling*: a claim
 * already on the wire is still handled to the end.
 */
export const createPairingRequestFlow = (deps: PairingRequestFlowDeps): PairingRequestFlow => {
    const now = deps.now ?? Date.now;
    const schedule = deps.schedule ?? ((run: () => void, ms: number) => setTimeout(run, ms));
    const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

    let state: PairingRequestState = { phase: 'requesting' };
    let running = false;
    let busy = false; // a request or a claim is on the wire
    let timer: unknown = null;
    let current: PairingRequestView | null = null;
    // Bumped by `restart`, so an answer that belongs to a code the user already replaced is ignored.
    let generation = 0;

    const set = (next: PairingRequestState) => {
        state = next;
        deps.onChange(next);
    };

    const clearTimer = () => {
        if (timer !== null) cancel(timer);
        timer = null;
    };

    const scheduleClaim = (ms: number) => {
        clearTimer();
        if (!running) return;
        timer = schedule(() => {
            timer = null;
            void claimOnce();
        }, ms);
    };

    const expire = (code: string) => {
        current = null;
        set({ phase: 'expired', code });
    };

    const finish = async (answer: Extract<PairingClaimView, { status: 'approved' }>) => {
        set({ phase: 'applying', target: answer.target });
        try {
            if (answer.target.type === 'cloud') {
                if (!answer.target.cloudId) throw new Error('a cloud approval without a cloudId');
                await deps.enterCloud(answer.target.cloudId);
            } else {
                if (!answer.session) throw new Error('a relay approval without its session');
                await deps.applySession(answer.session);
            }
            set({ phase: 'done', target: answer.target, approverName: answer.approver?.name });
        } catch {
            set({ phase: 'lost' });
        }
    };

    const claimOnce = async (): Promise<void> => {
        const pairing = current;
        if (!pairing || busy) return;
        // Past the code's lifetime by this device's clock, one last claim still goes out: the relay only
        // expires a pairing that is still pending, and an approval that landed in the last seconds — or
        // inside this clock's drift — is claimable after `expiredAt`. The relay's answer decides.
        const pastDeadline = now() >= pairing.expiredAt;

        const mine = generation;
        busy = true;
        let answer: PairingClaimView | null = null;
        let error: unknown = null;
        try {
            answer = await deps.claim(pairing.pairingId);
        } catch (e) {
            error = e;
        } finally {
            // An answer to a code the user already replaced must not free the replacement's claim slot.
            if (mine === generation) busy = false;
        }
        if (mine !== generation) {
            // That answer is the only one that will ever carry its session, so an approval is still
            // taken; anything else about a replaced code is ignored.
            if (answer?.status === 'approved') {
                generation++;
                current = null;
                clearTimer();
                busy = false;
                return finish(answer);
            }
            return;
        }

        if (pastDeadline && (error || answer?.status === 'pending')) return expire(pairing.code);

        if (error) {
            const status = pairingErrorStatus(error);
            // A network failure (no status) or a server hiccup keeps polling until the code expires;
            // a 4xx is an answer about this pairing and ends it.
            if (status !== undefined && status >= 400 && status < 500) {
                current = null;
                return set({ phase: 'failed', status });
            }
            return scheduleClaim(pairing.interval * 1000);
        }

        switch (answer?.status) {
            case 'approved':
                current = null;
                // Handled even when the screen has gone: this answer is the only one with the session.
                return finish(answer);
            case 'pending':
                return scheduleClaim(pairing.interval * 1000);
            case 'expired':
                return expire(pairing.code);
            case 'denied':
                current = null;
                return set({ phase: 'denied' });
            default:
                // `claimed` (someone else took the session) or `revoked`.
                current = null;
                return set({ phase: 'lost' });
        }
    };

    const requestCode = async (): Promise<void> => {
        const mine = ++generation;
        current = null;
        clearTimer();
        set({ phase: 'requesting' });
        busy = true;
        try {
            let view: PairingRequestView;
            try {
                view = await deps.request();
            } catch (e) {
                // The relay answers 503 when the random code it drew is taken; one more draw is enough.
                if (pairingErrorStatus(e) !== 503) throw e;
                view = await deps.request();
            }
            if (mine !== generation) return;
            current = view;
            set({ phase: 'waiting', code: view.code, expiredAt: view.expiredAt, pairingId: view.pairingId });
            busy = false;
            scheduleClaim(view.interval * 1000);
        } catch (e) {
            if (mine !== generation) return;
            set({ phase: 'failed', status: pairingErrorStatus(e) });
        } finally {
            if (mine === generation) busy = false;
        }
    };

    return {
        start() {
            if (running) return;
            running = true;
            if (current) {
                if (!busy) scheduleClaim(0);
                return;
            }
            if (state.phase === 'requesting' && !busy) void requestCode();
        },
        stop() {
            running = false;
            clearTimer();
        },
        restart() {
            running = true;
            void requestCode();
        },
        getState: () => state,
    };
};
