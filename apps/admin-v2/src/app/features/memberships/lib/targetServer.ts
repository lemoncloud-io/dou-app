/**
 * `lib/memberships/targetServer.ts`
 * - Which relay the console is pointed at, and how to point it somewhere else.
 *
 * This screen writes, and admin-v2 is not deployed — every operator runs it locally against
 * whatever their own `.env` names, which in practice is production. So the target is shown on the
 * screen and again in the confirmation dialog.
 *
 * The relay is `VITE_DOU_ENDPOINT` (`https://host/dou-d1`), the same value the http client resolves
 * for the `relay` route and the same one the log console rebuilds its stage from. It is **not**
 * `VITE_BACKEND_ENDPOINT` (`https://host/d1`), which is a different service — aiming these calls
 * there returns 404 for every route.
 */
export type RelayStage = 'v1' | 'd1';

export const RELAY_STAGES: RelayStage[] = ['d1', 'v1'];

export interface TargetServer {
    endpoint: string;
    isProd: boolean;
    label: string;
}

const STAGE_LABEL: Record<RelayStage, string> = { v1: '운영', d1: '개발' };

/** The configured endpoint with its `dou-XX` segment removed, e.g. `https://api.example.com`. */
export const relayHost = (endpoint: string | undefined): string =>
    (endpoint ?? '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/dou-[^/]*$/, '');

/** The base for a chosen stage. Empty when nothing is configured, so callers can refuse to fire. */
export const relayBaseFor = (endpoint: string | undefined, stage: RelayStage): string => {
    const host = relayHost(endpoint);
    return host ? `${host}/dou-${stage}` : '';
};

/**
 * Stage read off the endpoint's `dou-XX` segment. An endpoint following neither convention is
 * reported as unknown rather than guessed at — guessing "dev" on a production URL is the expensive
 * direction to be wrong in.
 */
export const describeTargetServer = (endpoint: string | undefined): TargetServer => {
    const url = (endpoint ?? '').trim().replace(/\/+$/, '');
    if (!url) {
        return { endpoint: '(미설정)', isProd: false, label: '알 수 없음' };
    }

    const stage = (url.match(/\/dou-([^/]*)$/)?.[1] ?? '') as RelayStage;
    if (stage === 'v1' || stage === 'd1') {
        return { endpoint: url, isProd: stage === 'v1', label: STAGE_LABEL[stage] };
    }

    return { endpoint: url, isProd: false, label: '알 수 없음' };
};

export const configuredEndpoint = (): string | undefined => import.meta.env.VITE_DOU_ENDPOINT;

/** The stage the `.env` names, used as the console's starting point. */
export const configuredStage = (): RelayStage => (describeTargetServer(configuredEndpoint()).isProd ? 'v1' : 'd1');

/**
 * The endpoint override for a chosen stage, or `undefined` to leave the call alone.
 *
 * Undefined for the configured stage on purpose: the http client resolves `relay` through
 * `getDynamicRelayBackend`, which honours a deeplink override and `window.DOU_ENDPOINT` before it
 * falls back to the env var. Overriding unconditionally would throw those away and pin every call
 * to whatever the build was compiled with.
 */
export const endpointOverrideFor = (stage: RelayStage): string | undefined =>
    stage === configuredStage() ? undefined : relayBaseFor(configuredEndpoint(), stage) || undefined;
