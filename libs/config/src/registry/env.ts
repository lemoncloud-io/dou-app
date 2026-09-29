import type { ConfigRegistryModule } from '../types';

/**
 * Read-only build facts. `writableBy: []` on every entry — nothing writes these, the env adapter
 * supplies them.
 *
 * `env.stage` and `env.buildStage` are deliberately two different keys (ADR-0080 decision 5).
 * `env.stage` mirrors today's behaviour (an injected value wins over the baked one); `env.buildStage`
 * reads only what the bundler baked in and cannot be spoofed, so security-relevant `byStage` rules
 * elsewhere in the registry are judged against it, not this one.
 */
export const envModule: ConfigRegistryModule = {
    // `env.stage`/`env.buildStage`/`env.platform` are resolved directly off the adapter
    // (`ConfigResolver`'s adapter-passthrough special case) — their `defaultValue`/`writableBy`
    // below exist for shape/typing only and are never actually reached.
    'env.stage': {
        title: 'Runtime stage',
        description: 'The runtime stage, with a shell-injected value taking priority. Not used for security decisions.',
        type: 'enum',
        values: ['LOCAL', 'DEV', 'PROD'],
        defaultValue: 'LOCAL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.buildStage': {
        title: 'Build stage',
        description:
            'The runtime stage baked into the bundle. Cannot be spoofed, so security rules are judged against it.',
        type: 'enum',
        values: ['LOCAL', 'DEV', 'PROD'],
        defaultValue: 'LOCAL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.platform': {
        title: 'Platform',
        description: 'The operating system this app is running on.',
        type: 'enum',
        values: ['ios', 'android', 'windows', 'macos', 'web'],
        defaultValue: 'web',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.project': {
        title: 'Project code',
        description: 'The project identifier this build belongs to.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_PROJECT',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.region': {
        title: 'Region',
        description: 'The AWS region the backend is deployed to.',
        type: 'string',
        defaultValue: 'ap-northeast-2',
        envDefaultKey: 'VITE_REGION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.host': {
        title: 'Host address',
        description: 'The address this build uses to refer to itself.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_HOST',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appId': {
        title: 'App bundle ID',
        description: 'The app identifier registered with the store. Dev builds use a separate ID.',
        type: 'string',
        defaultValue: 'io.chatic.dou',
        byStage: { LOCAL: 'io.chatic.dou.dev', DEV: 'io.chatic.dou.dev' },
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.webVersion': {
        title: 'Web build version',
        description: "This web bundle's version. Shown at the bottom of the settings screen.",
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_APP_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appVersion': {
        title: 'App version',
        description: "The shell's (native app's) version.",
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_CURRENT_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.appBuildNumber': {
        title: 'App build number',
        description: "The shell's build number.",
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_BUILD_NUMBER',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.osVersion': {
        title: 'OS version',
        description: "The device's operating system version.",
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_OS_VERSION',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.deviceModel': {
        title: 'Device model',
        description: "The device's model name. Holds model info only, not an identifier.",
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'CHATIC_APP_DEVICE_MODEL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
    'env.webviewBaseUrl': {
        title: 'Web load address',
        description: 'The address the app loaded the web bundle from. Does not change at runtime.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_WEBVIEW_BASE_URL',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
    },
};
