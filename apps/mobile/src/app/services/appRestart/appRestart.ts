import type { ILogService } from '../log';

/** Why the app started its JS context over. */
export type RestartReason = 'session-ended' | 'session-owner-changed';

/**
 * What a JS context leaves the next one when it restarts the app. Only a restart the app asked for
 * leaves one: an ordinary launch finds none.
 */
export interface RestartNote {
    reason: RestartReason;
    /**
     * The query the main WebView opens home with (`logout=1…`, without the `?`): the address a page would
     * have navigated to when its session ended. Set only for `session-ended`.
     */
    homeSearch?: string;
}

/** The part of an MMKV instance the note is kept in. */
export interface RestartNoteFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
}

export const RESTART_NOTE_KEY = 'restartNote';

const REASONS: readonly RestartReason[] = ['session-ended', 'session-owner-changed'];

/**
 * How long a note stays good after it was written. A reload takes well under a second; a note older
 * than this was left by a context the process died in before its reload landed, and the launch reading
 * it is the OS's — one opened by a link or a push tap that must not be taken for a restart.
 */
export const RESTART_NOTE_TTL_MS = 30_000;

/** A note as stored, or `null` for anything this build did not write, or one written too long ago. */
export const parseRestartNote = (raw: string | undefined, now: number): RestartNote | null => {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as (Partial<RestartNote> & { at?: unknown }) | null;
        if (!value || !REASONS.includes(value.reason as RestartReason)) return null;
        if (typeof value.at !== 'number' || now - value.at > RESTART_NOTE_TTL_MS || value.at > now) return null;
        return {
            reason: value.reason as RestartReason,
            ...(typeof value.homeSearch === 'string' && { homeSearch: value.homeSearch }),
        };
    } catch {
        return null;
    }
};

export interface AppRestartDeps {
    /** Opens the file the note is kept in; called at most once per JS context. */
    openFile: () => RestartNoteFile;
    /** Starts the JS context over; `false` when it could not (`AppRestartBridge.reload`). */
    reload: (reason: string) => Promise<boolean>;
    logService: ILogService;
    now?: () => number;
}

export interface AppRestart {
    /**
     * Leaves `note` for the next JS context and starts the context over. Answers `false` when the reload
     * did not happen; the note is then taken back, so the next ordinary launch does not read it as a
     * restart. A context restarts once: a second call while the first is under way answers the first's
     * result and leaves its note — a second reload would start a third context with no note at all.
     */
    restart(note: RestartNote): Promise<boolean>;
    /**
     * The note the previous context left, or `null` on an ordinary launch. Read and removed from the file
     * the first time it is asked, and kept for the rest of this context: every reader of one run has to
     * hear the same answer, and a later context must not read it again.
     */
    note(): RestartNote | null;
}

export const createAppRestart = ({ openFile, reload, logService, now = Date.now }: AppRestartDeps): AppRestart => {
    let file: RestartNoteFile | null = null;
    let taken: { note: RestartNote | null } | null = null;
    let restarting: Promise<boolean> | null = null;

    const fileOnce = (): RestartNoteFile => {
        file ??= openFile();
        return file;
    };

    const note = (): RestartNote | null => {
        if (taken) return taken.note;
        try {
            const notes = fileOnce();
            const raw = notes.getString(RESTART_NOTE_KEY);
            if (raw !== undefined) notes.remove(RESTART_NOTE_KEY);
            taken = { note: parseRestartNote(raw, now()) };
        } catch (error) {
            // A file that cannot be opened reads as an ordinary launch, which is what it was before.
            logService.error('app.restart_note_unreadable', 'Could not read the restart note', { error });
            taken = { note: null };
        }
        return taken.note;
    };

    const restartOnce = async (next: RestartNote): Promise<boolean> => {
        // Settle this context's own note first, so the one written below is never read back by it.
        note();
        try {
            fileOnce().set(RESTART_NOTE_KEY, JSON.stringify({ ...next, at: now() }));
        } catch (error) {
            logService.error('app.restart_failed', 'Could not leave the restart note', { error, reason: next.reason });
            return false;
        }
        logService.info('app.restart', 'Restarting the JS context', { reason: next.reason });
        const reloaded = await reload(next.reason);
        if (!reloaded) {
            fileOnce().remove(RESTART_NOTE_KEY);
            logService.error('app.restart_failed', 'The JS context did not restart', { reason: next.reason });
        }
        return reloaded;
    };

    const restart = (next: RestartNote): Promise<boolean> => {
        if (restarting) {
            logService.info('app.restart', 'A restart is already under way', { reason: next.reason });
            return restarting;
        }
        const attempt = restartOnce(next);
        restarting = attempt;
        // A reload that did not happen leaves the context running, and a later restart may try again.
        void attempt.then(reloaded => {
            if (!reloaded) restarting = null;
        });
        return attempt;
    };

    return { restart, note };
};
