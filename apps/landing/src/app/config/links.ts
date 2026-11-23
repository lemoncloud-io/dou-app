import { type Stage, isDevStage, isLocalhost } from './stage';

export const storeUrls = {
    ios: 'https://apps.apple.com/app/id6758658673',
    android: 'https://play.google.com/store/apps/details?id=io.chatic.dou',
} as const;

export const COMPANY = {
    registrationNumber: '596-87-01011',
    tel: '02-424-1212',
    email: 'lemon@lemoncloud.io',
} as const;

export const webConfigFor = ({ isLocalhost, isDevStage }: Pick<Stage, 'isLocalhost' | 'isDevStage'>) => {
    if (isLocalhost) {
        return {
            domain: 'localhost:5003',
            protocol: 'http',
        };
    }
    return {
        domain: isDevStage ? 'dou-dev.chatic.io' : 'dou.chatic.io',
        protocol: 'https',
    };
};

export const WEB_CONFIG = webConfigFor({ isLocalhost, isDevStage });
