import type { PairingRequestView, PairingTarget } from '@chatic/http';

import type { PairingClaimAnswer } from './pairingClaims';

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
    claim(pairingId: string): Promise<PairingClaimAnswer>;
    applySession(sessionHandle: string): Promise<void>;
    enterCloud(cloudId: string): Promise<void>;
    onChange(state: PairingRequestState): void;
    now?: () => number;
    schedule?: (run: () => void, ms: number) => unknown;
    cancel?: (handle: unknown) => void;
}

export const pairingErrorStatus = (error: unknown): number | undefined => {
    const e = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | null;
    const status = e?.status ?? e?.response?.status ?? e?.statusCode;
    return typeof status === 'number' ? status : undefined;
};

export const pairingErrorReason = (error: unknown): string => {
    const e = error as { message?: unknown; response?: { data?: unknown } } | null;
    const data = e?.response?.data;
    const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    return `${typeof e?.message === 'string' ? e.message : ''} ${text}`.toLowerCase();
};

export class PairingRequestFlow {
    private readonly now: () => number;
    private readonly schedule: (run: () => void, ms: number) => unknown;
    private readonly cancel: (handle: unknown) => void;

    private state: PairingRequestState = { phase: 'requesting' };
    private running = false;
    private busy = false;
    private timer: unknown = null;
    private current: PairingRequestView | null = null;
    private generation = 0;

    constructor(private readonly deps: PairingRequestFlowDeps) {
        this.now = deps.now ?? Date.now;
        this.schedule = deps.schedule ?? ((run: () => void, ms: number) => setTimeout(run, ms));
        this.cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        if (this.current) {
            if (!this.busy) this.scheduleClaim(0);
            return;
        }
        if (this.state.phase === 'requesting' && !this.busy) void this.requestCode();
    }

    stop(): void {
        this.running = false;
        this.clearTimer();
    }

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

    private async finish(answer: Extract<PairingClaimAnswer, { status: 'approved' }>): Promise<void> {
        this.set({ phase: 'applying', target: answer.target });
        try {
            if (answer.target.type === 'cloud') {
                if (!answer.target.cloudId) throw new Error('a cloud approval without a cloudId');
                await this.deps.enterCloud(answer.target.cloudId);
            } else {
                if (!answer.sessionHandle) throw new Error('a relay approval without its session');
                await this.deps.applySession(answer.sessionHandle);
            }
            this.set({ phase: 'done', target: answer.target, approverName: answer.approver?.name });
        } catch {
            this.set({ phase: 'lost' });
        }
    }

    private async claimOnce(): Promise<void> {
        const pairing = this.current;
        if (!pairing || this.busy) return;
        const pastDeadline = this.now() >= pairing.expiredAt;

        const mine = this.generation;
        this.busy = true;
        let answer: PairingClaimAnswer | null = null;
        let error: unknown = null;
        try {
            answer = await this.deps.claim(pairing.pairingId);
        } catch (e) {
            error = e;
        } finally {
            if (mine === this.generation) this.busy = false;
        }
        if (mine !== this.generation) {
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
            if (status !== undefined && status >= 400 && status < 500) {
                this.current = null;
                return this.set({ phase: 'failed', status });
            }
            return this.scheduleClaim(pairing.interval * 1000);
        }

        switch (answer?.status) {
            case 'approved':
                this.current = null;
                return this.finish(answer);
            case 'pending':
                return this.scheduleClaim(pairing.interval * 1000);
            case 'expired':
                return this.expire(pairing.code);
            case 'denied':
                this.current = null;
                return this.set({ phase: 'denied' });
            default:
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
