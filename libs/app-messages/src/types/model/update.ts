/**
 * 데스크탑 앱 자동 업데이트 (electron-updater) 메시지 페이로드.
 * 셸(main)이 업데이트 상태를 OnUpdateStatus 이벤트로 보내고, 웹(renderer)이
 * 사용자 동의 후 StartUpdateDownload / RestartToUpdate 를 요청합니다.
 */

/** [이벤트] 업데이트 상태 (app -> web). 진행률/버전은 상태에 따라 채워집니다. */
export type OnUpdateStatusPayload = {
    status: 'available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    /** downloading 일 때 0–100. */
    percent?: number;
    /** error 일 때 사람이 읽을 수 있는 메시지. */
    message?: string;
};

/** [요청] 업데이트 다운로드 시작 (web -> app). 진행률/결과는 OnUpdateStatus 로 전달. */
export type StartUpdateDownloadPayload = {
    // 추후 확장에 대비한 빈 객체 타입입니다.
};

/** [응답] 업데이트 다운로드 시작 수락 결과. */
export type OnStartUpdateDownloadPayload = {
    success: boolean;
};

/** [요청] 업데이트 적용을 위한 재시작 (web -> app). quitAndInstall 로 앱이 즉시 종료됩니다. */
export type RestartToUpdatePayload = {
    // 추후 확장에 대비한 빈 객체 타입입니다.
};

/** [응답] 재시작 요청 결과 (앱이 즉시 종료되므로 보통 전달되지 않음). */
export type OnRestartToUpdatePayload = {
    success: boolean;
};
