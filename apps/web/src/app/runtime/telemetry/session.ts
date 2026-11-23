export const SESSION_IDLE_MS = 30 * 60_000;

export type SessionEntry = 'icon' | 'push' | 'deeplink' | 'browser';

export interface TelemetrySessionOptions {
    now: () => number;
    createId: () => string;
    recordEvent: (
        name: 'session_start' | 'session_end',
        fields: { attrs?: Record<string, string>; metrics?: Record<string, number> }
    ) => void;
    entry: SessionEntry;
    onNewSession?: () => void;
}

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
