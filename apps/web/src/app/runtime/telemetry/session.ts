/** Back in the foreground after longer than this away, a run starts a new usage session. */
export const SESSION_IDLE_MS = 30 * 60_000;

export type SessionEntry = 'icon' | 'push' | 'deeplink' | 'browser';

export interface TelemetrySessionOptions {
    now: () => number;
    createId: () => string;
    /** Records a usage event. Called after the session id it belongs to is current. */
    recordEvent: (
        name: 'session_start' | 'session_end',
        fields: { attrs?: Record<string, string>; metrics?: Record<string, number> }
    ) => void;
    /** How this run was entered — `browser` for the standalone web, `icon` in the app. */
    entry: SessionEntry;
    /** Called right after a new session has started, so the screen on display can be counted in it. */
    onNewSession?: () => void;
}

/**
 * The usage session: shorter-lived than the run.
 *
 * A run can sit in the background for days, so "one run" is a poor unit for usage. A return to the
 * foreground after more than 30 minutes away ends the session and starts a new one, recording
 * `session_end` for the old (while its id is still current, so the event carries it) and
 * `session_start` for the new. Sampling is unaffected: it follows the run, not the session.
 */
export class TelemetrySession {
    private currentId: string;
    private startedAt: number;
    private hiddenAt?: number;
    private screens = 0;

    constructor(private readonly options: TelemetrySessionOptions) {
        this.currentId = options.createId();
        this.startedAt = options.now();
    }

    public get id(): string {
        return this.currentId;
    }

    /** Records the run's first session start. Separate from construction so the id exists before any record. */
    public begin(): void {
        this.options.recordEvent('session_start', { attrs: { start: 'cold', entry: this.options.entry } });
    }

    public countScreen(): void {
        this.screens += 1;
    }

    public hidden(): void {
        this.hiddenAt ??= this.options.now();
    }

    public visible(): void {
        const hiddenAt = this.hiddenAt;
        this.hiddenAt = undefined;
        if (hiddenAt === undefined || this.options.now() - hiddenAt <= SESSION_IDLE_MS) return;

        this.options.recordEvent('session_end', {
            metrics: { duration_ms: Math.max(0, hiddenAt - this.startedAt), screens: this.screens },
        });

        this.currentId = this.options.createId();
        this.startedAt = this.options.now();
        this.screens = 0;
        this.options.recordEvent('session_start', { attrs: { start: 'resume', entry: this.options.entry } });
        this.options.onNewSession?.();
    }
}
