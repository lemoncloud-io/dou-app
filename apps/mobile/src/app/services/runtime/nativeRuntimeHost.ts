import type { NativeRuntimeBoot } from '@chatic/runtime-mobile';

import type { ILogService } from '../log';
import type { SessionOwner } from './sessionOwner';

type Engine = NativeRuntimeBoot['engine'];

export interface NativeRuntimeHostDeps {
    readOwner: () => SessionOwner;
    boot: (leaveToHome: (params: URLSearchParams) => void) => Promise<NativeRuntimeBoot>;
    run: (engine: Engine) => () => void;
    onHoldChange?: (held: boolean) => void;
    logService: ILogService;
}

export interface NativeRuntimeHost {
    owner(): SessionOwner;
    start(): Promise<Engine | null>;
    engine(): Engine | null;
    holdsSession(): boolean;
    onSessionEnded(listener: (params: URLSearchParams) => void): () => void;
}

export const createNativeRuntimeHost = ({
    readOwner,
    boot,
    run,
    onHoldChange,
    logService,
}: NativeRuntimeHostDeps): NativeRuntimeHost => {
    let owner: SessionOwner | null = null;
    let starting: Promise<Engine | null> | null = null;
    let engine: Engine | null = null;
    let holding = false;
    const sessionEnded = new Set<(params: URLSearchParams) => void>();

    const setHolding = (next: boolean) => {
        if (holding === next) return;
        holding = next;
        try {
            onHoldChange?.(next);
        } catch (error) {
            logService.error('session.native_hold', 'The hold listener threw', { error });
        }
    };

    const readOwnerOnce = (): SessionOwner => {
        owner ??= readOwner();
        return owner;
    };

    const leaveToHome = (params: URLSearchParams) => {
        logService.info('session.native_ended', 'Session ended; going home', { reason: params.get('reason') });
        sessionEnded.forEach(listener => {
            try {
                listener(params);
            } catch (error) {
                logService.error('session.native_ended', 'A session-ended listener threw', { error });
            }
        });
    };

    const startOnce = async (): Promise<Engine | null> => {
        if (readOwnerOnce() !== 'native') return null;
        const startedAt = Date.now();

        let booted: NativeRuntimeBoot;
        try {
            booted = await boot(leaveToHome);
        } catch (error) {
            if ((error as { code?: unknown } | null)?.code === 'NATIVE_RUNTIME_NO_SESSION') {
                logService.info(
                    'session.native_runtime_declined',
                    'The vault holds no session; the page takes this launch',
                    {
                        secretStorage: (error as { secretStorage?: unknown }).secretStorage,
                    }
                );
                return null;
            }
            const missing = (error as { missing?: unknown } | null)?.missing;
            logService.error(
                'session.native_runtime_failed',
                'Native runtime failed to boot; the page keeps the session',
                {
                    error,
                    ...(Array.isArray(missing) && { data: { missing } }),
                }
            );
            return null;
        }

        try {
            run(booted.engine);
        } catch (error) {
            logService.error(
                'session.native_runtime_failed',
                'Native runtime booted but did not start; the page keeps the session',
                {
                    error,
                }
            );
            return null;
        }

        engine = booted.engine;
        logService.info('session.native_runtime_started', 'Native runtime started', {
            ms: Date.now() - startedAt,
            vault: booted.vault.status,
            secretStorage: booted.secretStorage,
        });
        return engine;
    };

    return {
        owner: readOwnerOnce,
        start: () => {
            if (starting) return starting;
            starting = startOnce();
            if (readOwnerOnce() === 'native') {
                setHolding(true);
                void starting.then(
                    started => {
                        if (!started) setHolding(false);
                    },
                    () => setHolding(false)
                );
            }
            return starting;
        },
        engine: () => engine,
        holdsSession: () => holding,
        onSessionEnded: listener => {
            sessionEnded.add(listener);
            return () => sessionEnded.delete(listener);
        },
    };
};
