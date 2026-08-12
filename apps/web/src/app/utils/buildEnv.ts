/**
 * Whether this is a development-class build (`VITE_ENV` = DEV/LOCAL).
 *
 * Lives in `app/utils` so any feature may depend on it without reaching across features, and the
 * `import.meta.env` read is isolated in its own module because ts-jest's CommonJS transform cannot
 * parse `import.meta` — component tests mock this module instead.
 *
 * This is the single home for the predicate. `features/auth/utils/env` used to hold a second copy
 * built on `features/debug/lib/isDevEnv`; that dependency broke when the debug overlay moved to an
 * entry-code gate and deleted `isDevEnv`, so auth/mypage now import this module directly.
 */
export const isDevBuild = (): boolean => {
    const env = import.meta.env?.VITE_ENV;
    return env === 'DEV' || env === 'LOCAL';
};
