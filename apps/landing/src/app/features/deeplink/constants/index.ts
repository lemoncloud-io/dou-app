import { storeUrls } from '../../home/constants';

export const APP_CONFIG = {
    name: 'DoU',
    scheme: 'chatic',
    packageId: 'io.chatic.dou',
    appStoreId: '6758658673',
    storeUrls,
} as const;

export const DEEPLINK_CONFIG = {
    launchTimeout: 2500,
    collectionName: 'deferredDeepLinks',
    linkTtlHours: 1,
} as const;
