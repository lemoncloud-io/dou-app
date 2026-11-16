/** Who holds the session this launch: the page, as it always has, or the app's own runtime. */
export type SessionOwner = 'web' | 'native';

/** The key the choice is kept under, in its own file (`RUNTIME_STORAGE_IDS.mode`). */
export const SESSION_OWNER_KEY = 'sessionOwner';

/** The part of an MMKV instance the choice is read and written through. */
export interface SessionOwnerFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

/**
 * The owner this launch runs with. Anything but an explicit `native` is the page's: the choice is a
 * development setting, off unless someone turned it on, and a value this build does not know must not
 * move the session.
 */
export const readSessionOwner = (file: SessionOwnerFile): SessionOwner =>
    file.getString(SESSION_OWNER_KEY) === 'native' ? 'native' : 'web';

/**
 * Records the owner for the NEXT launch. The owner is settled once per launch — a page that asks again
 * must hear the same answer — so a change takes effect when the app next starts, never mid-run.
 */
export const writeSessionOwner = (file: SessionOwnerFile, owner: SessionOwner): void =>
    file.set(SESSION_OWNER_KEY, owner);
