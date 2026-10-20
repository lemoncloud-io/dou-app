import { defineShell } from '@lemoncloud/hybrid-shell';

import { deepLinkNavigation, pushTapNavigation } from './apps/shell-adapter/src/routes';
import type { DouEvents, DouMethods } from './apps/shell-adapter/src/types';

const BACKEND_ENV_SOURCE =
    'download it from the team secrets repository, where it sits at the same path (ONBOARDING.md § Env and Firebase files)';

/**
 * `yarn local`: the web in the virtual mobile shell (`@lemoncloud/hybrid-shell`), or the web alone, or
 * the simulator run. What each part means is in `apps/shell-adapter/README.md`.
 */
export default defineShell<DouMethods, DouEvents>({
    app: { name: 'chatic', displayName: 'DoU' },
    preset: 'app-bridge-host',
    web: {
        // Vite straight from the web's folder: `nx serve` would add its own process tree, which a stop
        // has to reach through.
        start: 'cd apps/web && exec node ../../node_modules/vite/bin/vite.js --port {port} --strictPort',
        port: 5003,
        // The web's Vite plugins read `process.env`, so the backend's files go into its environment.
        envFiles: ['apps/web/.env', 'apps/web/.env.{env}'],
    },
    native: { ios: 'yarn mobile:ios:local', android: 'yarn mobile:android:local' },
    shell: { viteConfig: 'apps/shell-adapter/vite.shell.config.mts' },
    env: {
        files: ['apps/web/.env', 'apps/web/.env.{env}', 'apps/mobile/.env.{env}'],
        source: 'manual',
        hints: {
            'apps/web/.env': 'cp apps/web/.env.example apps/web/.env, then fill in your values',
            // The per-backend files carry real endpoints, so they have no template.
            'apps/web/.env.{env}': BACKEND_ENV_SOURCE,
            'apps/mobile/.env.{env}': `${BACKEND_ENV_SOURCE}; the shell reads the Google sign-in client (VITE_GOOGLE_WEB_CLIENT_ID) from it`,
        },
    },
    events: {
        'app.state': {
            name: 'OnBackgroundStatusChanged',
            payload: ({ state }) => ({
                status: state,
                isBackground: state === 'background',
                isForeground: state === 'active',
            }),
        },
        'push.received': {
            name: 'OnReceiveNotification',
            payload: ({ title, body, data }) => ({ notification: { title, body, data } }),
        },
        // A tap only brings the app forward and routes; the app hears nothing else for it.
        'push.tapped': { name: 'OnNavigate', payload: ({ data }) => pushTapNavigation(data) },
        deeplink: { name: 'OnNavigate', payload: ({ url }) => deepLinkNavigation(url) },
        back: { name: 'OnBackPressed', payload: () => ({}) },
    },
    requests: {
        'auth.login': 'OAuthLogin',
        'badge.set': 'SetBadgeCount',
        // Named so the shell refuses it outright (pitfall 1): a request no handler answers asks the
        // panel, and a person typing a token there would register a fake device.
        'push.token': 'FetchFcmToken',
    },
    handlers: () => import('./apps/shell-adapter/src/handlers'),
    auth: { preset: 'oauth-popup', provider: 'google', clientIdEnv: 'VITE_GOOGLE_WEB_CLIENT_ID' },
    quickLinks: {
        origin: 'https://app-dev.chatic.io',
        screens: [
            { id: 'home', path: '/' },
            { id: 'my', path: '/mypage' },
            { id: 'settings', path: '/mypage/settings' },
            { id: 'notifications', path: '/mypage/settings/notifications' },
        ],
    },
    scenarios: 'apps/shell-adapter/scenarios',
    imitation: 'apps/shell-adapter/README.md',
});
