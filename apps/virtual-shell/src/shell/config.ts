declare const __VIRTUAL_SHELL_CONFIG__: { env: 'dev' | 'prod'; googleClientId: string };

/** What `yarn local` started this shell with — fixed for the life of the page. */
export interface ShellConfig {
    /** The backend the web was started against. */
    env: 'dev' | 'prod';
    /** The Google client the mobile app signs in with; empty when the env file has none. */
    googleClientId: string;
}

export const SHELL_CONFIG: ShellConfig = __VIRTUAL_SHELL_CONFIG__;

/**
 * The stage the app would inject for this backend: the mobile app's `toEnvStage` turns `VITE_ENV`
 * DEV into `stage` and PROD into `prod`. The web reads this ahead of its own build stage, so a stage
 * that disagreed with the backend would split every stage-gated branch (the debug overlay, the deep
 * link scheme) from the endpoints actually in use.
 */
export const appStageFor = (env: ShellConfig['env']): 'stage' | 'prod' => (env === 'prod' ? 'prod' : 'stage');
