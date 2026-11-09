/**
 * `config/stageEndpoints.ts`
 * - The per-stage service bases the console's stage toggles call.
 *
 * Several screens switch between the dev (`d1`) and production (`v1`) stage at run time, so one
 * build reaches both. Each stage's base is its own env key, never rebuilt from another key by
 * swapping a path segment: the two stages do not share a host, so a URL made up that way names a
 * server that does not exist.
 *
 * The same values go into every `.env` of this app — what differs between builds is the stage the
 * session signs in to (`VITE_DOU_ENDPOINT`), not where each stage lives.
 */
import { webConfigPorts } from './adapters';

export type ServiceStage = 'd1' | 'v1';

/** relay `dou-XX` · goods `cgs-XX` · archive `arc-XX` · presence `skt-XX` · ws `cht-XX` */
export type StageService = 'relay' | 'goods' | 'archive' | 'presence' | 'ws';

/** e.g. `('relay', 'd1')` → `VITE_D1_RELAY_ENDPOINT`. */
export const stageEndpointKey = (service: StageService, stage: ServiceStage): string =>
    `VITE_${stage.toUpperCase()}_${service.toUpperCase()}_ENDPOINT`;

/** The base for a service on a stage, trailing slashes dropped. `''` when the key is unset. */
export const readStageEndpoint = (
    read: (name: string) => string | undefined,
    service: StageService,
    stage: ServiceStage
): string => `${read(stageEndpointKey(service, stage)) ?? ''}`.trim().replace(/\/+$/, '');

/**
 * The stage every toggle opens on: production in a production build, development in any other.
 *
 * Not the stage the session signs in to — the console always signs in to production, whatever the
 * build. A development build opening on production would put an operator's first write there.
 */
export const openingStage = (): ServiceStage => (webConfigPorts.env.stage() === 'PROD' ? 'v1' : 'd1');

/** Read through the app's config adapter, the one place here that touches `import.meta`. */
export const stageEndpoint = (service: StageService, stage: ServiceStage): string =>
    readStageEndpoint(name => webConfigPorts.env.raw(name), service, stage);

/** The session's own relay (`VITE_DOU_ENDPOINT`), trailing slashes dropped. */
export const sessionRelayEndpoint = (): string =>
    `${webConfigPorts.env.raw('VITE_DOU_ENDPOINT') ?? ''}`.trim().replace(/\/+$/, '');

/**
 * The stage the session's relay is on, read off its `dou-XX` segment: `v1` only when it plainly says
 * so. Production in every build today, since the console always signs in there.
 */
export const sessionRelayStage = (): ServiceStage => (/\/dou-v1$/.test(sessionRelayEndpoint()) ? 'v1' : 'd1');

/**
 * The relay override for a call on `stage`, or `undefined` to leave the call on the session's relay.
 *
 * Undefined for the session's own stage on purpose: the http client resolves the relay through
 * `getDynamicRelayBackend`, which honours a deeplink override and `window.DOU_ENDPOINT` before the
 * env var, and an override would throw those away. Throws for another stage whose key is unset —
 * undefined there would send the call to the session's relay, the other stage, while the screen says
 * it is on this one.
 */
export const relayOverrideFor = (stage: ServiceStage): string | undefined => {
    if (stage === sessionRelayStage()) return undefined;
    const endpoint = stageEndpoint('relay', stage);
    if (!endpoint) throw new Error(`${stageEndpointKey('relay', stage)} is not set — no relay to call on ${stage}.`);
    return endpoint;
};

/** Where calls on `stage` actually go: the session's relay on its own stage, else that stage's key. */
export const relayTargetFor = (stage: ServiceStage): string =>
    stage === sessionRelayStage() ? sessionRelayEndpoint() : stageEndpoint('relay', stage);
