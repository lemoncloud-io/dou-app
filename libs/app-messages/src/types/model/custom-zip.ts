// src/types/model/custom-zip.ts

/**
 * 커스텀 web zip — QA가 특정 웹 빌드를 기기에서 띄워 보는 수단.
 *
 * 조작면이 앱 화면에서 웹으로 옮겨졌다(ADR-0080 결정 11). **그런데 이 명령은 zip 주소로 WebView가
 * 실행할 코드를 정한다** — 결정 13이 웹 주소 바꾸기를 지운 것과 같은 성질의 보안면이다. 그래서
 * 네이티브 핸들러가 **빌드 스테이지로 fail-closed 게이트**를 건다: PROD 빌드는 거부한다. 판정 기준은
 * 웹 페이지가 조작할 수 없는 baked `VITE_ENV`이고, 앱의 `FloatingMenu`가 이 기능의 진입을 막던
 * `ALLOW_ENVIRONMENT_SETTINGS`와 같은 가드를 그 자리에서 옮겨온 것이다.
 */

/** [요청] zip을 내려받아 풀고 로컬 서버로 띄운다. */
export type ApplyCustomZipPayload = {
    /** 내려받을 zip 주소 */
    url: string;
};

/** [응답] 적용 결과. `serverUrl`이 있으면 WebView가 그 주소로 다시 로드된다. */
export type OnApplyCustomZipPayload = {
    success: boolean;
    serverUrl: string | null;
};

/** [요청] 커스텀 zip을 끄고 기본 웹으로 되돌린다. */
export type DisableCustomZipPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] 해제 결과. */
export type OnDisableCustomZipPayload = {
    success: boolean;
};

/** [요청] 지금 적용된 커스텀 zip 상태 조회. */
export type FetchCustomZipStatusPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/**
 * [응답] 지금 상태. `allowed`가 false면 이 빌드에서 기능 자체가 막혀 있다는 뜻이므로,
 * 웹은 실패로 보이는 대신 그 사실을 표시해야 한다.
 */
export type OnFetchCustomZipStatusPayload = {
    allowed: boolean;
    localRoot: string | null;
    serverUrl: string | null;
};
