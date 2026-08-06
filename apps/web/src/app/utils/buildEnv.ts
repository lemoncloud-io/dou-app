/**
 * Whether this is a development-class build (`VITE_ENV` = DEV/LOCAL).
 *
 * Lives in `app/utils` so any feature may depend on it without reaching across features, and the
 * `import.meta.env` read is isolated in its own module because ts-jest's CommonJS transform cannot
 * parse `import.meta` — component tests mock this module instead.
 *
 * The predicate is duplicated rather than imported from `features/debug/lib/isDevEnv` on purpose:
 * a shared layer must not depend on a feature.
 */
export const isDevBuild = (): boolean => {
    const env = import.meta.env?.VITE_ENV;
    return env === 'DEV' || env === 'LOCAL';
};
