import type { IConfigEnvAdapter } from '../ports';
import type { Platform, Stage } from '../types';

const VALID_STAGES: readonly Stage[] = ['LOCAL', 'DEV', 'PROD'];
const isStage = (value: string | undefined): value is Stage => VALID_STAGES.includes(value as Stage);

const LOWERED_RAW_NAMES = new Set([
    'VITE_PROJECT',
    'VITE_REGION',
    'VITE_HOST',
    'VITE_OAUTH_ENDPOINT',
    'VITE_SOCIAL_OAUTH_ENDPOINT',
]);

export const createWebEnvAdapter = (read: (name: string) => string | undefined): IConfigEnvAdapter => {
    const buildStage = (): Stage => {
        const raw = (read('VITE_ENV') ?? '').toUpperCase();
        return isStage(raw) ? raw : 'LOCAL';
    };

    return {
        buildStage,
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
