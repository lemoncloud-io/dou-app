import Config from 'react-native-config';

import { openSessionOwnerFile } from './runtimeStorageFiles';
import { defaultSessionOwner, readSessionOwner } from './sessionOwner';
import type { SessionOwner } from './sessionOwner';

/** This build's owner for an install nobody has switched: the app's runtime on a dev stage build. */
export const buildDefaultSessionOwner = (): SessionOwner =>
    defaultSessionOwner(Config.VITE_ENV, Config.VITE_SESSION_OWNER_DEFAULT);

let owner: SessionOwner | null = null;

/**
 * The session owner of this launch, read once from its file and kept for the process: the owner is
 * settled per launch, and everything that asks — the logs, the runtime host — has to hear the same
 * answer. With nothing recorded it is the build's default (`buildDefaultSessionOwner`). A file that
 * cannot be opened reads as the page's, on any build: an unreadable setting must not move the session.
 *
 * Kept apart from the runtime host so reading it costs one MMKV read: the host's module loads the
 * whole runtime, which a launch the page owns never needs.
 */
export const launchSessionOwner = (): SessionOwner => {
    if (owner === null) {
        try {
            owner = readSessionOwner(openSessionOwnerFile(), buildDefaultSessionOwner());
        } catch {
            owner = 'web';
        }
    }
    return owner;
};

let answered: SessionOwner | null = null;

/**
 * Records what the app answered a page's hello with — `native` when its runtime started, `web` when it
 * could not (a build without the runtime's services, say). Every hello of a launch is answered alike,
 * so the last one recorded stands for the launch.
 */
export const recordAnsweredSessionOwner = (next: SessionOwner): void => {
    answered = next;
};

/**
 * Who actually holds the session this launch, for statistics to be read by: the page on a launch it
 * owns; on one set to the app's runtime, what the app answered the page's hello, and nothing before it
 * has answered. `launchSessionOwner` is the setting, which on a launch whose runtime failed to start
 * says `native` while the page holds the session.
 */
export const settledSessionOwner = (): SessionOwner | undefined =>
    launchSessionOwner() === 'web' ? 'web' : (answered ?? undefined);
