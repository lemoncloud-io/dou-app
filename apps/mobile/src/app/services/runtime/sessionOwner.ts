import { toEnvStage } from '../../utils/stage';

/** Who holds the session this launch: the page, as it always has, or the app's own runtime. */
export type SessionOwner = 'web' | 'native';

/** The key the choice is kept under, in its own file (`RUNTIME_STORAGE_IDS.mode`). */
export const SESSION_OWNER_KEY = 'sessionOwner';

/** The part of an MMKV instance the choice is read and written through. */
export interface SessionOwnerFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

const isSessionOwner = (value: string | undefined): value is SessionOwner => value === 'web' || value === 'native';

/**
 * The owner a launch runs with when nobody has chosen one: the app's runtime on a development stage
 * build (`VITE_ENV` `DEV`), so the DoU Dev app runs on it without a trip to the switch; the page on
 * every other stage. A production build — and any value this build does not recognise, which counts as
 * production — always answers the page, whatever else the build carries: turning the runtime on for
 * real installs is not a build setting.
 *
 * `override` is the build's `VITE_SESSION_OWNER_DEFAULT`, which lets a non-production build start on
 * the other owner — the device scenarios pin it to the page, so a fresh install starts where their
 * switch step expects it. A value that is not an owner is ignored.
 */
export const defaultSessionOwner = (stage: string | undefined, override?: string): SessionOwner => {
    const envStage = toEnvStage(stage);
    if (envStage === 'prod') return 'web';
    if (isSessionOwner(override)) return override;
    return envStage === 'stage' ? 'native' : 'web';
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
