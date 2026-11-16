/** Who holds the session this launch: the page, as it always has, or the app's own runtime. */
export type SessionOwner = 'web' | 'native';

/** The key the choice is kept under, in its own file (`RUNTIME_STORAGE_IDS.mode`). */
export const SESSION_OWNER_KEY = 'sessionOwner';

/**
 * The key the page's default is kept under, beside the switch's choice: the owner of an install nobody
 * switched, as the web build last named it (`SetDefaultSessionOwner`).
 */
export const DEFAULT_SESSION_OWNER_KEY = 'defaultSessionOwner';

/** The part of an MMKV instance the choice is read and written through. */
export interface SessionOwnerFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
}

const isSessionOwner = (value: string | undefined): value is SessionOwner => value === 'web' || value === 'native';

/**
 * The owner a launch runs with when nobody has chosen one: the app's runtime on a dev or production
 * build (`VITE_ENV` `DEV` or `PROD`), the page on a `LOCAL` one. A value this build does not recognise —
 * an env file that failed to load — keeps the page: such a build lacks the runtime's service settings
 * too, and a setting the app cannot read must not move the session.
 *
 * `override` is the build's `VITE_SESSION_OWNER_DEFAULT`, which lets a build start on the other owner —
 * the device scenarios pin it to the page, so a fresh install starts where their switch step expects it.
 * A value that is not an owner is ignored, and so is any override on an unrecognised stage.
 */
export const defaultSessionOwner = (stage: string | undefined, override?: string): SessionOwner => {
    const raw = (stage ?? '').toUpperCase();
    if (raw !== 'LOCAL' && raw !== 'DEV' && raw !== 'PROD') return 'web';
    if (isSessionOwner(override)) return override;
    return raw === 'LOCAL' ? 'web' : 'native';
};

const isRecognisedStage = (stage: string | undefined): boolean =>
    ['LOCAL', 'DEV', 'PROD'].includes((stage ?? '').toUpperCase());

/**
 * The owner of an install nobody switched, in order: the build's pin (`override`), then the page's
 * default (`SetDefaultSessionOwner`), then the stage's own default. The pin outranks the page because it
 * is how a test build fixes where a fresh install starts — a web build that names an owner must not move
 * a scenario run. A build whose stage cannot be recognised keeps the page whatever either says: its env
 * file did not load, so it lacks the runtime's service settings too.
 */
export const unswitchedSessionOwner = (
    stage: string | undefined,
    override: string | undefined,
    pageDefault: SessionOwner | undefined
): SessionOwner => {
    if (!isRecognisedStage(stage)) return 'web';
    if (isSessionOwner(override)) return override;
    return pageDefault ?? defaultSessionOwner(stage);
};

/**
 * The owner this launch runs with: the one recorded by the switch, or `fallback` when none is — no
 * file, no key, or a value this build does not know, none of which may move the session by itself.
 */
export const readSessionOwner = (file: SessionOwnerFile, fallback: SessionOwner = 'web'): SessionOwner => {
    const stored = file.getString(SESSION_OWNER_KEY);
    return isSessionOwner(stored) ? stored : fallback;
};

/**
 * Records the owner for the NEXT launch. The owner is settled once per launch — a page that asks again
 * must hear the same answer — so a change takes effect when the app next starts, never mid-run.
 */
export const writeSessionOwner = (file: SessionOwnerFile, owner: SessionOwner): void =>
    file.set(SESSION_OWNER_KEY, owner);

/** The page's default, as last recorded — `undefined` with none, or with a value this build does not know. */
export const readDefaultSessionOwner = (file: SessionOwnerFile): SessionOwner | undefined => {
    const stored = file.getString(DEFAULT_SESSION_OWNER_KEY);
    return isSessionOwner(stored) ? stored : undefined;
};

/**
 * Records the page's default for the NEXT launch, or clears it with `null` so the build's own default
 * applies again. It is kept apart from the switch's choice, which it never overwrites: a person who
 * switched one install keeps that install where they put it.
 */
export const writeDefaultSessionOwner = (file: SessionOwnerFile, owner: SessionOwner | null): void => {
    if (owner === null) file.remove(DEFAULT_SESSION_OWNER_KEY);
    else file.set(DEFAULT_SESSION_OWNER_KEY, owner);
};
