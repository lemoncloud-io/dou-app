import type { Logger } from '@chatic/logger';

export type RestartReason = 'session-ended' | 'session-owner-changed';

export interface RestartNote {
    reason: RestartReason;
    homeSearch?: string;
}

export interface RestartNoteFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
}

export const RESTART_NOTE_KEY = 'restartNote';

const REASONS: readonly RestartReason[] = ['session-ended', 'session-owner-changed'];

export const RESTART_NOTE_TTL_MS = 30_000;

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
    openFile: () => RestartNoteFile;
    reload: (reason: string) => Promise<boolean>;
    logService: Logger;
    now?: () => number;
}

export interface AppRestart {
    restart(note: RestartNote): Promise<boolean>;
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
            logService.error('app.restart_note_unreadable', 'Could not read the restart note', { error });
            taken = { note: null };
        }
        return taken.note;
    };

    const restartOnce = async (next: RestartNote): Promise<boolean> => {
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
        void attempt.then(reloaded => {
            if (!reloaded) restarting = null;
        });
        return attempt;
    };

    return { restart, note };
};
