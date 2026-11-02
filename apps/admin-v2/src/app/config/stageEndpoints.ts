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

/** Read through the app's config adapter, the one place here that touches `import.meta`. */
export const stageEndpoint = (service: StageService, stage: ServiceStage): string =>
    readStageEndpoint(name => webConfigPorts.env.raw(name), service, stage);
