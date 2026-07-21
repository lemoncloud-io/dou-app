/**
 * `model/endpoint-presets.ts`
 */
export interface EndpointPreset {
    label: string;
    wsUrl: string;
}

const WS_ENDPOINT = `${import.meta.env.VITE_WS_ENDPOINT ?? ''}`.trim();

export const ENDPOINT_PRESETS: EndpointPreset[] = WS_ENDPOINT ? [{ label: 'server', wsUrl: `${WS_ENDPOINT}?v2` }] : [];

export const DEFAULT_WS_URL = ENDPOINT_PRESETS[0]?.wsUrl ?? '';
