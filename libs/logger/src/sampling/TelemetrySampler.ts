import { isTelemetryEntry } from '../core/kind';
import { samplingBucket } from './bucket';
import { DEFAULT_TELEMETRY_POLICY, TELEMETRY_STREAM_SALT, resolveTelemetryRate, telemetryStreamOf } from './policy';

import type { LogContext, LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryPolicy, TelemetryStream } from './policy';

export interface TelemetryDecision {
    sampled: boolean;
    sr: number;
    pv: number;
    forced: boolean;
}

export interface TelemetrySamplerOptions {
    policy?: TelemetryPolicy;
    runId?: string;
    now?: () => number;
}

export const FORCED_ATTR = 'forced';

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

    public get version(): number {
        return this.policy.version;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

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
        if (!runId) return { sampled: false, sr: rate, pv, forced: false };

        return { sampled: samplingBucket(runId, TELEMETRY_STREAM_SALT[stream]) < rate, sr: rate, pv, forced: false };
    }

    public decideFor(kind: TelemetryKind, tag: string, context?: LogContext): TelemetryDecision {
        return this.decide(telemetryStreamOf(kind), tag, context);
    }

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
                ...(decision.forced ? { attrs: { [FORCED_ATTR]: '1', ...entry.attrs } } : {}),
            });
        }
        return kept;
    }
}
