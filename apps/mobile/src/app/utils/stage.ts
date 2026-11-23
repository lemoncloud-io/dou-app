import type { Env } from '@chatic/bridge-messages';

export const toEnvStage = (raw: string | undefined): Env => {
    switch ((raw ?? '').toUpperCase()) {
        case 'LOCAL':
            return 'local';
        case 'DEV':
            return 'stage';
        default:
            return 'prod';
    }
};
