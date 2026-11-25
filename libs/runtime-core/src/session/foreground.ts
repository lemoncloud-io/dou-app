import type { ForegroundSignal } from '@chatic/ports';

export type { ForegroundSignal };

export interface IForegroundPlatform {
    configure(signal: ForegroundSignal): void;
    ports(): ForegroundSignal;
}

class ForegroundPlatform implements IForegroundPlatform {
    private configured: ForegroundSignal | null = null;

    configure(signal: ForegroundSignal): void {
        this.configured = signal;
    }

    ports(): ForegroundSignal {
        if (!this.configured) {
            throw new Error(
                '[runtime-core] the foreground signal was used before it was configured — the entry point ' +
                    'has to pass `foreground` to createRuntime().'
            );
        }
        return this.configured;
    }
}

export const foregroundPlatform: IForegroundPlatform = new ForegroundPlatform();
