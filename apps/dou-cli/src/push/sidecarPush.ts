import { type FcmConfig, type FcmPush, type PushHost, startPush } from '@chatic/push-desktop';

import { createNodePushHost } from './nodeHost';

type Env = Record<string, string | undefined>;
type Call = (method: string, params?: unknown) => Promise<unknown>;
type Start = (
    config: FcmConfig,
    handlers: { onToken: (token: string) => void; onPush: (push: FcmPush) => void },
    host: PushHost
) => void;

export const FCM_ENV: Record<keyof FcmConfig, string> = {
    apiKey: 'VITE_FCM_API_KEY',
    projectId: 'VITE_FCM_PROJECT_ID',
    senderId: 'VITE_FCM_SENDER_ID',
    appId: 'VITE_FCM_APP_ID',
    packageName: 'VITE_FCM_PACKAGE',
};

const TOKEN_RETRY_MS = 2_000;
const TOKEN_RETRIES = 30;

export const builtFcmValues = (): Env => {
    try {
        return JSON.parse(process.env.DOU_BUILD_FCM ?? '{}') as Env;
    } catch {
        return {};
    }
};

export const readFcmConfig = (env: Env, built: Env): FcmConfig | null => {
    const entries = Object.entries(FCM_ENV).map(([key, name]) => [key, env[name] || built[name] || ''] as const);
    if (entries.some(([, value]) => !value)) return null;
    return Object.fromEntries(entries) as unknown as FcmConfig;
};

const codeOf = (error: unknown): string =>
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'error';

export interface SidecarPushOptions {
    profile: string;
    env: Env;
    call: Call;
    log: (line: string) => void;
    start?: Start;
    built?: Env;
    retries?: number;
}

export const startSidecarPush = ({
    profile,
    env,
    call,
    log,
    start = startPush,
    built = builtFcmValues(),
    retries = TOKEN_RETRIES,
}: SidecarPushOptions): (() => void) => {
    let disposed = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sendToken = (token: string | null, attempt: number, current: number): void => {
        call('push_token', { token }).catch(error => {
            if (disposed || current !== generation) return;
            if (attempt + 1 >= retries) {
                log(`push: the shell did not take the token after ${attempt + 1} tries (${codeOf(error)})`);
                return;
            }
            timer = setTimeout(() => sendToken(token, attempt + 1, current), TOKEN_RETRY_MS);
        });
    };
    const deliverToken = (token: string | null): void => {
        clearTimeout(timer);
        generation += 1;
        sendToken(token, 0, generation);
    };

    const config = readFcmConfig(env, built);
    if (!config) {
        log('push: FCM is not configured, push is off');
        deliverToken(null);
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }

    const node = createNodePushHost(profile);
    const host: PushHost = {
        ...node.host,
        onError: (stage, error) => log(`push: ${stage} failed (${codeOf(error)})`),
    };
    start(
        config,
        {
            onToken: token => {
                log(`push: token received (${token.length} chars)`);
                deliverToken(token);
            },
            onPush: ({ title, body, deeplink, data }) => {
                call('push_message', { title, body, deeplink, data }).catch(error =>
                    log(`push: a push was dropped (${codeOf(error)})`)
                );
            },
        },
        host
    );
    return () => {
        disposed = true;
        clearTimeout(timer);
        node.dispose();
    };
};
