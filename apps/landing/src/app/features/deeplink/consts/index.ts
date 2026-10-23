import { storeUrls } from '../../../config/links';
import { isDevStage } from '../../../config/stage';

export const APP_CONFIG = {
    name: 'DoU',
    scheme: isDevStage ? 'chatic-dev' : 'chatic',
    packageId: isDevStage ? 'io.chatic.dou.dev' : 'io.chatic.dou',
    appStoreId: '6758658673',
    storeUrls,
} as const;

export const DEEPLINK_CONFIG = {
    launchTimeout: 2500,
    collectionName: 'deferredDeepLinks',
    linkTtlHours: 1,
} as const;
