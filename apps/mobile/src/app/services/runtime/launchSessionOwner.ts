import Config from 'react-native-config';

import { openSessionOwnerFile } from './runtimeStorageFiles';
import { readDefaultSessionOwner, readSessionOwnerChoice, unswitchedSessionOwnerChoice } from './sessionOwner';
import type { SessionOwner, SessionOwnerChoice, SessionOwnerFile } from './sessionOwner';

const unswitchedSessionOwnerChoiceOf = (file: SessionOwnerFile): SessionOwnerChoice =>
    unswitchedSessionOwnerChoice(Config.VITE_ENV, Config.VITE_SESSION_OWNER_DEFAULT, readDefaultSessionOwner(file));

/**
 * The owner of an install nobody switched: the build's pin, else the page's default when the web build
 * named one, else the stage's own. The page's word counts on a production build too — that is its
 * purpose: which side real installs run on is decided by a web deploy, not by an app release.
 */
export const unswitchedSessionOwner = (file: SessionOwnerFile): SessionOwner =>
    unswitchedSessionOwnerChoiceOf(file).owner;

let choice: SessionOwnerChoice | null = null;

/**
 * The session owner of this launch, read once from its file and kept for the process: the owner is
 * settled per launch, and everything that asks — the logs, the runtime host — has to hear the same
 * answer. With no switch choice recorded it is the page's default, or else the build's
 * (`unswitchedSessionOwner`). A file that
 * cannot be opened reads as the page's, on any build: an unreadable setting must not move the session.
 *
 * Kept apart from the runtime host so reading it costs one MMKV read: the host's module loads the
 * whole runtime, which a launch the page owns never needs.
 */
export const launchSessionOwner = (): SessionOwner => launchSessionOwnerChoice().owner;

/**
 * `launchSessionOwner`, with the row that settled it (`SessionOwnerSource`) — read once with it, so the
 * owner and the reason the boot logs for it are the same answer.
 */
export const launchSessionOwnerChoice = (): SessionOwnerChoice => {
    if (choice === null) {
        try {
            const file = openSessionOwnerFile();
            choice = readSessionOwnerChoice(file, unswitchedSessionOwnerChoiceOf(file));
        } catch {
            choice = { owner: 'web', source: 'unreadable' };
        }
    }
    return choice;
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
