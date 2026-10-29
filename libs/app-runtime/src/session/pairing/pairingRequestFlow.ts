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
export class PairingRequestFlow {
    private readonly now: () => number;
    private readonly schedule: (run: () => void, ms: number) => unknown;
    private readonly cancel: (handle: unknown) => void;

    private state: PairingRequestState = { phase: 'requesting' };
    private running = false;
    private busy = false; // a request or a claim is on the wire
    private timer: unknown = null;
    private current: PairingRequestView | null = null;
    // Bumped by `restart`, so an answer that belongs to a code the user already replaced is ignored.
    private generation = 0;

    constructor(private readonly deps: PairingRequestFlowDeps) {
        this.now = deps.now ?? Date.now;
        this.schedule = deps.schedule ?? ((run: () => void, ms: number) => setTimeout(run, ms));
        this.cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    }

    /** Starts a request, or — when one is already under way — resumes polling it. */
    start(): void {
        if (this.running) return;
        this.running = true;
        if (this.current) {
            if (!this.busy) this.scheduleClaim(0);
            return;
        }
        if (this.state.phase === 'requesting' && !this.busy) void this.requestCode();
    }

    /** Stops scheduling claims. A claim already in flight still finishes, approval and all. */
    stop(): void {
        this.running = false;
        this.clearTimer();
    }

    /** Drops the current code and asks for a new one. */
    restart(): void {
        this.running = true;
        void this.requestCode();
    }

    getState(): PairingRequestState {
        return this.state;
    }

    private set(next: PairingRequestState): void {
        this.state = next;
        this.deps.onChange(next);
    }

    private clearTimer(): void {
        if (this.timer !== null) this.cancel(this.timer);
        this.timer = null;
    }

    private scheduleClaim(ms: number): void {
        this.clearTimer();
        if (!this.running) return;
        this.timer = this.schedule(() => {
            this.timer = null;
            void this.claimOnce();
        }, ms);
    }

    private expire(code: string): void {
        this.current = null;
        this.set({ phase: 'expired', code });
    }

    private async finish(answer: Extract<PairingClaimView, { status: 'approved' }>): Promise<void> {
        this.set({ phase: 'applying', target: answer.target });
        try {
            if (answer.target.type === 'cloud') {
                if (!answer.target.cloudId) throw new Error('a cloud approval without a cloudId');
                await this.deps.enterCloud(answer.target.cloudId);
            } else {
                if (!answer.session) throw new Error('a relay approval without its session');
                await this.deps.applySession(answer.session);
            }
            this.set({ phase: 'done', target: answer.target, approverName: answer.approver?.name });
        } catch {
            this.set({ phase: 'lost' });
        }
    }

    private async claimOnce(): Promise<void> {
        const pairing = this.current;
        if (!pairing || this.busy) return;
        // Past the code's lifetime by this device's clock, one last claim still goes out: the relay only
        // expires a pairing that is still pending, and an approval that landed in the last seconds — or
        // inside this clock's drift — is claimable after `expiredAt`. The relay's answer decides.
        const pastDeadline = this.now() >= pairing.expiredAt;

        const mine = this.generation;
        this.busy = true;
        let answer: PairingClaimView | null = null;
        let error: unknown = null;
        try {
            answer = await this.deps.claim(pairing.pairingId);
        } catch (e) {
            error = e;
        } finally {
            // An answer to a code the user already replaced must not free the replacement's claim slot.
            if (mine === this.generation) this.busy = false;
        }
        if (mine !== this.generation) {
            // That answer is the only one that will ever carry its session, so an approval is still
            // taken; anything else about a replaced code is ignored.
            if (answer?.status === 'approved') {
                this.generation++;
                this.current = null;
                this.clearTimer();
                this.busy = false;
                return this.finish(answer);
            }
            return;
        }

        if (pastDeadline && (error || answer?.status === 'pending')) return this.expire(pairing.code);

        if (error) {
            const status = pairingErrorStatus(error);
            // A network failure (no status) or a server hiccup keeps polling until the code expires;
            // a 4xx is an answer about this pairing and ends it.
            if (status !== undefined && status >= 400 && status < 500) {
                this.current = null;
                return this.set({ phase: 'failed', status });
            }
            return this.scheduleClaim(pairing.interval * 1000);
        }

        switch (answer?.status) {
            case 'approved':
                this.current = null;
                // Handled even when the screen has gone: this answer is the only one with the session.
                return this.finish(answer);
            case 'pending':
                return this.scheduleClaim(pairing.interval * 1000);
            case 'expired':
                return this.expire(pairing.code);
            case 'denied':
                this.current = null;
                return this.set({ phase: 'denied' });
            default:
                // `claimed` (someone else took the session) or `revoked`.
                this.current = null;
                return this.set({ phase: 'lost' });
        }
    }

    private async requestCode(): Promise<void> {
        const mine = ++this.generation;
        this.current = null;
        this.clearTimer();
        this.set({ phase: 'requesting' });
        this.busy = true;
        try {
            let view: PairingRequestView;
            try {
                view = await this.deps.request();
            } catch (e) {
                // The relay answers 503 when the random code it drew is taken; one more draw is enough.
                if (pairingErrorStatus(e) !== 503) throw e;
                view = await this.deps.request();
            }
            if (mine !== this.generation) return;
            this.current = view;
            this.set({ phase: 'waiting', code: view.code, expiredAt: view.expiredAt, pairingId: view.pairingId });
            this.busy = false;
            this.scheduleClaim(view.interval * 1000);
        } catch (e) {
            if (mine !== this.generation) return;
            this.set({ phase: 'failed', status: pairingErrorStatus(e) });
        } finally {
            if (mine === this.generation) this.busy = false;
        }
    }
}
