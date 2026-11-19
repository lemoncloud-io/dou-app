/**
 * The env keys that name a backend, and which apps carry them.
 *
 * Every app keeps its own `apps/<app>/.env.<stage>`, but the backend's addresses are one fact per stage:
 * the deploy workflows already write them from one set of secrets for the apps of a group (`WEB_<STAGE>_*`
 * for web, landing and desktop-web; `ADMIN_<STAGE>_*` for admin), and the phone app has to reach the same
 * servers as the page it hosts. A local copy that drifts from the others builds an app that talks to a
 * server the deployed one never does, and nothing notices. `scripts/check-env.js` holds the copies to this
 * table.
 *
 * The table covers the backend only. A key that belongs to one app — its own host, the store SKUs, the
 * signing keys — is that app's business and is not listed.
 */

/** Keys that name the backend a build talks to, plus the stage and project the server reads them under. */
const BACKEND_KEYS = [
    'VITE_ENV',
    'VITE_PROJECT',
    'VITE_HOST',
    'VITE_OAUTH_ENDPOINT',
    'VITE_SOCIAL_OAUTH_ENDPOINT',
    'VITE_BACKEND_ENDPOINT',
    'VITE_WS_ENDPOINT',
    'VITE_DOU_ENDPOINT',
    'VITE_ARCHIVE_ENDPOINT',
    'VITE_SOC_ENDPOINT',
    'VITE_IAP_ENDPOINT',
    'VITE_IMAGE_API_ENDPOINT',
];

/** What `VITE_ENV` reads in each stage's file. A stage missing here has no fixed value (localhost). */
const STAGE_VALUES = { dev: 'DEV', prod: 'PROD' };

/**
 * Each app's group and the backend keys its files carry. Apps of one group share every key they both
 * carry, per stage. The lists follow what the deploy workflows write for the app, or for mobile what its
 * build reads, so a key the deploy writes and a local file lacks is reported.
 */
const APPS = {
    web: { group: 'web', carries: BACKEND_KEYS },
    // Deployed from the web's secrets: the same backend, only another bucket.
    'desktop-web': { group: 'web', carries: BACKEND_KEYS },
    // Its account screens sign in to the web's relay session, so its addresses must be the web's.
    landing: {
        group: 'web',
        carries: [
            'VITE_ENV',
            'VITE_PROJECT',
            'VITE_OAUTH_ENDPOINT',
            'VITE_SOCIAL_OAUTH_ENDPOINT',
            'VITE_DOU_ENDPOINT',
            'VITE_WS_ENDPOINT',
        ],
    },
    // The phone app hosts the web and, when it holds the session, talks to the same servers itself.
    mobile: {
        group: 'web',
        carries: [
            'VITE_ENV',
            'VITE_PROJECT',
            'VITE_HOST',
            'VITE_OAUTH_ENDPOINT',
            'VITE_SOCIAL_OAUTH_ENDPOINT',
            'VITE_BACKEND_ENDPOINT',
            'VITE_DOU_ENDPOINT',
            'VITE_WS_ENDPOINT',
        ],
    },
    // A group of its own: it is deployed from its own secrets and signs in to its own servers.
    admin: {
        group: 'admin',
        carries: BACKEND_KEYS.filter(key => key !== 'VITE_SOC_ENDPOINT' && key !== 'VITE_IAP_ENDPOINT'),
    },
};

/** The stage files checked: `.env.<stage>`. `.env` itself is the local default and is only described. */
const STAGES = ['dev', 'prod', 'localhost'];

module.exports = { APPS, BACKEND_KEYS, STAGES, STAGE_VALUES };
