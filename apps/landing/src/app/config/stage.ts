export interface Stage {
    isLocalhost: boolean;
    isDevStage: boolean;
    isProductionHost: boolean;
}

export const PRODUCTION_HOST = 'app.chatic.io';

export const readStage = (hostname: string, devBuild: boolean): Stage => ({
    isLocalhost: hostname === 'localhost' || hostname === '127.0.0.1',
    isDevStage: devBuild || hostname.includes('-dev') || hostname.includes('app-dev'),
    isProductionHost: hostname === PRODUCTION_HOST,
});

export const readProductionBuild = (buildEnv: unknown): boolean =>
    typeof buildEnv === 'string' && buildEnv.toUpperCase() === 'PROD';

export const readSubscriptionAccountEnabled = (hostname: string, productionBuild: boolean): boolean =>
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('-dev') ||
    (hostname === PRODUCTION_HOST && productionBuild);

export const { isLocalhost, isDevStage, isProductionHost } = readStage(window.location.hostname, import.meta.env.DEV);

const isProductionBuild = readProductionBuild(import.meta.env.VITE_ENV);

export const isSubscriptionAccountEnabled = readSubscriptionAccountEnabled(window.location.hostname, isProductionBuild);
