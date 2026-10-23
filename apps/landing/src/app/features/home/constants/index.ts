import { WEB_CONFIG } from '../../deeplink/constants';

/** The web app, on whichever stage this landing build is serving (localhost, dev or prod). */
export const WEB_APP_URL = `${WEB_CONFIG.protocol}://${WEB_CONFIG.domain}`;

export const SECTION_IDS = {
    features: 'features',
    how: 'how-it-works',
    plans: 'plans',
    download: 'download',
} as const;
