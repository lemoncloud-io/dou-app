/**
 * `model/endpoint-presets.ts`
 * - WS 엔드포인트는 배포 환경(VITE_WS_ENDPOINT)이 dev/prod를 결정. local mock 없음.
 * - 운영자는 ConnectionPane ws url 입력으로 직접 수정 가능.
 */
export interface EndpointPreset {
    label: string;
    wsUrl: string;
}

const WS_ENDPOINT = `${import.meta.env.VITE_WS_ENDPOINT ?? ''}`.trim();

/** 배포 env의 WS 엔드포인트 1개. 미설정 시 빈 목록(운영자가 ws url 직접 입력). */
export const ENDPOINT_PRESETS: EndpointPreset[] = WS_ENDPOINT ? [{ label: 'server', wsUrl: `${WS_ENDPOINT}?v2` }] : [];

/** 카드 기본 ws url — env 프리셋(없으면 빈 문자열). */
export const DEFAULT_WS_URL = ENDPOINT_PRESETS[0]?.wsUrl ?? '';
