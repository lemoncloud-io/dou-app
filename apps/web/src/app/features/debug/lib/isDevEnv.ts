// Returns true only for development-class environments (DEV/LOCAL builds).
// Kept as a pure function of the env string so it stays unit-testable: the actual
// `import.meta.env.VITE_ENV` read lives at the call site, because `import.meta` is
// unavailable under ts-jest's CommonJS transform.
export const isDevEnv = (env: string | undefined): boolean => env === 'DEV' || env === 'LOCAL';
