import type { IConfigEnvAdapter } from '../ports';
import type { Platform, Stage } from '../types';

const VALID_STAGES: readonly Stage[] = ['LOCAL', 'DEV', 'PROD'];
const isStage = (value: string | undefined): value is Stage => VALID_STAGES.includes(value as Stage);

/**
 * Raw names whose value this repo has always compared case-insensitively — kept lowercase to match
 * `web-config/src/env.ts`'s exact behaviour byte-for-byte (`WEB_PROJECT`/`WEB_REGION`/`WEB_HOST`/
 * `WEB_OAUTH_ENDPOINT`/`WEB_SOCIAL_OAUTH_ENDPOINT` were all `.toLowerCase()`d).
 *
 * The endpoint names absent here (`VITE_DOU_ENDPOINT` · `VITE_WS_ENDPOINT` · `VITE_IAP_ENDPOINT` ·
 * `VITE_BACKEND_ENDPOINT`) carry path segments, where case is significant — those were never lowered
 * and must not start being lowered now.
 */
const LOWERED_RAW_NAMES = new Set([
    'VITE_PROJECT',
    'VITE_REGION',
    'VITE_HOST',
    'VITE_OAUTH_ENDPOINT',
    'VITE_SOCIAL_OAUTH_ENDPOINT',
]);

/**
 * Builds an `IConfigEnvAdapter` from a platform's own raw-value reader.
 *
 * Every Vite app (web · desktop-web · admin-v2 · testbed) reads `import.meta.env`/`window.*` the
 * same way, so this centralizes the interpretation — stage validation, the shell-injected stage
 * mapping, the legacy lowercasing — in one tested place instead of four copies. Each app supplies
 * only `read`, the one piece this lib cannot hold (`import.meta`, ADR-0079 결정 1): a function from
 * a raw name to its value, wherever that app's build keeps it.
 */
export const createWebEnvAdapter = (read: (name: string) => string | undefined): IConfigEnvAdapter => {
    const buildStage = (): Stage => {
        const raw = (read('VITE_ENV') ?? '').toUpperCase();
        return isStage(raw) ? raw : 'LOCAL';
    };

    return {
        buildStage,
        // The injected value wins over the baked one — matching `WEB_ENV`'s
        // `window.ENV || import.meta.env.VITE_ENV` today. `CHATIC_APP_STAGE`'s vocabulary
        // (`'local'|'stage'|'prod'`, `app-messages`'s `Env`) differs from `Stage`'s
        // (`'LOCAL'|'DEV'|'PROD'`) and is normalized here (ADR-0079 결정 14).
        stage: () => {
            const injected = read('CHATIC_APP_STAGE');
            if (injected === 'prod') return 'PROD';
            if (injected === 'stage') return 'DEV';
            if (injected === 'local') return 'LOCAL';
            return buildStage();
        },
        platform: () => (read('CHATIC_APP_PLATFORM') as Platform | undefined) ?? 'web',
        raw: name => {
            const value = read(name);
            if (value === undefined) return undefined;
            return LOWERED_RAW_NAMES.has(name) ? value.toLowerCase() : value;
        },
    };
};
