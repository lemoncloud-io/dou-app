import { type Stage, isDevStage, isLocalhost } from './stage';

/**
 * Addresses outside this site that more than one feature points at: the home page's store
 * buttons and the deep-link page's install fallback both send people to the same two listings.
 */
export const storeUrls = {
    ios: 'https://apps.apple.com/app/id6758658673',
    android: 'https://play.google.com/store/apps/details?id=io.chatic.dou',
} as const;

/**
 * The business details the footer prints that read the same in every language. The name,
 * representative and address are copy (`footer.company.*`), since they are written per language.
 */
export const COMPANY = {
    registrationNumber: '596-87-01011',
    tel: '02-424-1212',
    email: 'lemon@lemoncloud.io',
} as const;

/** The web app this site hands an invite over to when the reader continues in the browser. */
export const webConfigFor = ({ isLocalhost, isDevStage }: Stage) => {
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
