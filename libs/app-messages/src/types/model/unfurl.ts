/**
 * `unfurl.ts`
 * - link preview (URL unfurl) message payloads
 *
 * 데스크탑 셸의 main process가 웹 대신 URL을 fetch해 og: 메타데이터를
 * 파싱합니다 (renderer는 CORS로 외부 페이지를 읽을 수 없음).
 */

/** [요청] URL 메타데이터(og:) 조회 페이로드 (web -> app). */
export type FetchUrlMetadataPayload = {
    url: string;
};

/** [응답] URL 메타데이터 결과 페이로드. success=false면 미리보기 없음(음성 캐시 대상). */
export type OnFetchUrlMetadataPayload = {
    success: boolean;
    url: string;
    title?: string;
    description?: string;
    /** https 이미지 URL만 전달됩니다 (바이너리는 IPC로 보내지 않음). */
    imageUrl?: string;
    siteName?: string;
};
