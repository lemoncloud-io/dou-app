import { openSessionOwnerFile } from './runtimeStorageFiles';
import { readSessionOwner } from './sessionOwner';
import type { SessionOwner } from './sessionOwner';

let owner: SessionOwner | null = null;

/**
 * The session owner of this launch, read once from its file and kept for the process: the owner is
 * settled per launch, and everything that asks — the logs, the runtime host — has to hear the same
 * answer. A file that cannot be opened reads as the page's, which is what every launch was before.
 *
 * Kept apart from the runtime host so reading it costs one MMKV read: the host's module loads the
 * whole runtime, which a launch the page owns never needs.
 */
export const launchSessionOwner = (): SessionOwner => {
    if (owner === null) {
        try {
            owner = readSessionOwner(openSessionOwnerFile());
        } catch {
            owner = 'web';
        }
    }
    return owner;
};
