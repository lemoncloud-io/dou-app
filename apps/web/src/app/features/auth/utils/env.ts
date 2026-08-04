import { isDevEnv } from '../../debug/lib/isDevEnv';

/**
 * Whether this is a development-class build (VITE_ENV DEV/LOCAL) — gates the code-delivery
 * switches (dryRun / Slack) on the phone-verification screen. The `import.meta` read is isolated
 * in this module because ts-jest cannot parse it; component tests mock this module.
 */
export const isDevBuild = (): boolean => isDevEnv(import.meta.env?.VITE_ENV);
