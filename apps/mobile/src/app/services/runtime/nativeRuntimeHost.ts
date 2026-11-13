import type { NativeRuntimeBoot } from '@chatic/runtime-mobile';

import type { ILogService } from '../log';
import type { SessionOwner } from './sessionOwner';

type Engine = NativeRuntimeBoot['engine'];

/** What a host is built from. Every native module stays behind these, so the host is plain logic. */
export interface NativeRuntimeHostDeps {
    /** Who owns the session this launch. Read once, the first time it is asked. */
    readOwner: () => SessionOwner;
    /** Boots the runtime, telling it what to do when a session ends. */
    boot: (leaveToHome: (params: URLSearchParams) => void) => Promise<NativeRuntimeBoot>;
    /** Starts what keeps the booted session alive; answers the stop. */
    run: (engine: Engine) => () => void;
    logService: ILogService;
}

export interface NativeRuntimeHost {
    /** Who owns the session this launch — settled the first time it is read, for the rest of the process. */
    owner(): SessionOwner;
    /**
     * Boots and runs the runtime, once per process: a second call answers the first one's result. It
     * answers `null` when the page owns the session this launch, or when the start failed: a boot that
     * failed created nothing and the page keeps the session; a run that failed after the boot leaves no
     * side running it this launch. It may stay pending for as long as the vault is locked (iOS, before
     * the first unlock) — a caller that answers someone must not wait on it unbounded.
     */
    start(): Promise<Engine | null>;
    /** The running engine, or `null` before `start` has finished (or when it answered `null`). */
    engine(): Engine | null;
    /**
     * Hears each session end: the runtime saved the address it ended with (`logout=1` among it) for the
     * next boot, and the app now takes the person home — the WebView is the one to reload.
     */
    onSessionEnded(listener: (params: URLSearchParams) => void): () => void;
}

/**
 * The app's runtime host: one per process, outside React, so it outlives a WebView reload or a
 * WebView content-process restart — the session and its sockets are the app's, not the page's.
 */
export const createNativeRuntimeHost = ({
    readOwner,
    boot,
    run,
    logService,
}: NativeRuntimeHostDeps): NativeRuntimeHost => {
    let owner: SessionOwner | null = null;
    let starting: Promise<Engine | null> | null = null;
    let engine: Engine | null = null;
    const sessionEnded = new Set<(params: URLSearchParams) => void>();

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
            // Nothing was created: the build lacked a value, or the runtime could not be assembled.
            const missing = (error as { missing?: unknown }).missing;
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
            // The runtime exists and owns this process's session stores; `run` stopped what it had
            // started. Neither side runs the session for the rest of this launch.
            logService.error(
                'session.native_runtime_failed',
                'Native runtime booted but did not start; no side runs the session this launch',
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
            starting ??= startOnce();
            return starting;
        },
        engine: () => engine,
        onSessionEnded: listener => {
            sessionEnded.add(listener);
            return () => sessionEnded.delete(listener);
        },
    };
};
