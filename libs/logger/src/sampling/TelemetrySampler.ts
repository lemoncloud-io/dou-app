import { isTelemetryEntry } from '../core/kind';
import { samplingBucket } from './bucket';
import { DEFAULT_TELEMETRY_POLICY, TELEMETRY_STREAM_SALT, resolveTelemetryRate, telemetryStreamOf } from './policy';

import type { LogContext, LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryPolicy, TelemetryStream } from './policy';

/** The verdict for one record. */
export interface TelemetryDecision {
    sampled: boolean;
    /** The rate it was kept at — the `sr` the entry carries. */
    sr: number;
    /** The policy version that decided — the `pv` the entry carries. */
    pv: number;
    /** Kept because of a debugging override. */
    forced: boolean;
}

export interface TelemetrySamplerOptions {
    /** The policy this run uses, read once at its start. Defaults to statistics off. */
    policy?: TelemetryPolicy;
    /** This run's id, for records whose own context has none. */
    runId?: string;
    now?: () => number;
}

/** The attribute a forced record carries, so a 100% override can be told from a sampled run. */
export const FORCED_ATTR = 'forced';

/**
 * Decides which statistics a run keeps. Logs never come here.
 *
 * **The policy is fixed for the run.** It is read once at the start and every rule and rate stays as
 * read — a rate changed mid-run would leave a run's records half there, which is worse than either
 * answer. Only the two switches meant to act at once are refreshed while the run goes on
 * ({@link updateSwitches}): the kill switch and the debugging overrides.
 *
 * **The verdict is a pure function of the run id.** The same run gets the same answer here, in a
 * later cycle and in another runtime, which is what lets statistics recorded natively — before
 * anything knew the policy — be judged on their way out instead ({@link selectForUpload}).
 */
export class TelemetrySampler {
    private readonly policy: TelemetryPolicy;
    private readonly runId?: string;
    private readonly now: () => number;
    private enabled: boolean;
    private force: TelemetryPolicy['force'];

    constructor(options: TelemetrySamplerOptions = {}) {
        this.policy = options.policy ?? DEFAULT_TELEMETRY_POLICY;
        this.runId = options.runId;
        this.now = options.now ?? Date.now;
        this.enabled = this.policy.enabled;
        this.force = this.policy.force;
    }

    /** The policy version every verdict of this run is stamped with. */
    public get version(): number {
        return this.policy.version;
    }

    /** Whether statistics are switched on right now. */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Takes the kill switch and the overrides from a freshly read policy, and nothing else. Called
     * once per upload cycle — and only with a policy that was actually read. A failed read must not
     * pass the default here: its `enabled: false` would empty every queued statistic.
     */
    public updateSwitches(latest: TelemetryPolicy): void {
        this.enabled = latest.enabled;
        this.force = latest.force;
    }

    public decide(stream: TelemetryStream, tag: string, context: LogContext = {}): TelemetryDecision {
        const runId = context.runId ?? this.runId;
        const { rate, forced } = resolveTelemetryRate(
            { ...this.policy, enabled: this.enabled, force: this.force },
            {
                stream,
                tag,
                uid: context.uid,
                runId,
                platform: context.platform,
                host: context.host,
                appVersion: context.appVersion,
                webVersion: context.webVersion,
            },
            this.now()
        );

        const pv = this.policy.version;
        if (forced) return { sampled: true, sr: 1, pv, forced: true };
        if (rate <= 0) return { sampled: false, sr: rate, pv, forced: false };
        if (rate >= 1) return { sampled: true, sr: 1, pv, forced: false };
        // A fractional rate needs a run to hash; without one the answer could not be consistent.
        if (!runId) return { sampled: false, sr: rate, pv, forced: false };

        return { sampled: samplingBucket(runId, TELEMETRY_STREAM_SALT[stream]) < rate, sr: rate, pv, forced: false };
    }

    /** {@link decide} for a record of the given kind. */
    public decideFor(kind: TelemetryKind, tag: string, context?: LogContext): TelemetryDecision {
        return this.decide(telemetryStreamOf(kind), tag, context);
    }

    /**
     * Judges the statistics in a batch being drawn for upload — `LogUploadScheduler`'s
     * `selectTelemetry`.
     *
     * - Switched off: none are sent, so the queued ones are acknowledged and gone.
     * - Already judged (it carries `sr`): it was sampled when it was made, and is sent as is.
     * - Not judged yet — a native record made before anything knew the policy: judged now against
     *   its own context and stamped with `sr`/`pv`, or acknowledged without being sent.
     */
    public selectForUpload(entries: LogEntry[]): LogEntry[] {
        if (!this.enabled) return [];

        const kept: LogEntry[] = [];
        for (const entry of entries) {
            if (!isTelemetryEntry(entry)) continue;
            if (entry.sr !== undefined) {
                kept.push(entry);
                continue;
            }

            const decision = this.decideFor(entry.kind as TelemetryKind, entry.tag, entry);
            if (!decision.sampled) continue;

            kept.push({
                ...entry,
                sr: decision.sr,
                pv: decision.pv,
                // First, so the wire's 16-attribute cap can never be what drops it.
                ...(decision.forced ? { attrs: { [FORCED_ATTR]: '1', ...entry.attrs } } : {}),
            });
        }
        return kept;
    }
}
