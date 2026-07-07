import type { Platform } from './common';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';

/** 앱 및 웹 버전 정보 */
export type VersionInfo = {
    currentVersion: string; // 현재 통합 버전
    latestVersion: string; // 서버 최신 버전
    shouldUpdate: boolean; // 업데이트 강제 여부
    appVersion: string; // 네이티브 빌드 버전
    webVersion: string; // 번들링된 웹 버전
};

/** 디바이스 고유 정보 */
export type DeviceInfo = {
    stage: Env;
    platform: Platform;
    application: string; // 앱 패키지명/번들ID
    deviceToken?: string; // 푸시용 토큰 (FCM/APNS)
    /** @deprecated Composite `deviceId:firebaseInstallId`; use `uniqueDeviceId` + `firebaseInstallationId`. */
    deviceId?: string | null;
    deviceModel?: string | null;
    /** @deprecated Carries the bare device id despite the name; use `uniqueDeviceId`. */
    installId?: string | null;
    /** Bare unique device id, stable across app reinstalls. */
    uniqueDeviceId?: string | null;
    /** Firebase installation id; changes on app reinstall. */
    firebaseInstallationId?: string | null;
    lang?: PageLanguage;
};

/** 디스플레이 안전 영역 (노치, 홈바 대응) */
export type SafeAreaInfo = {
    top: number;
    bottom: number;
    left: number;
    right: number;
};

/** [응답] 디바이스/버전 정보 업데이트 페이로드 */
export type OnUpdateDeviceInfoPayload = DeviceInfo & VersionInfo;

/** [응답] 세이프 에어리어 정보 반환 페이로드 */
export type OnFetchSafeAreaPayload = SafeAreaInfo;

// --- File Upload Types ---

/** [요청] 파일 업로드 요청 페이로드 */
export type RequestFileUploadPayload = {
    uploadId: string; // 업로드 고유 식별자 (Web에서 UUID 생성하여 네이티브에 제어권 전달)
    fileUri: string; // 기기 내부 임시 파일 URI (DocumentPicker/ImagePicker 획득 주소)
    fileName: string; // 파일 이름
    fileSize: number; // 파일 전체 크기 (bytes)
    mimeType: string; // 파일 MIME 타입
    uploadUrl: string; // 업로드 대상 API 엔드포인트 URL
    chunkSize?: number; // 분할 전송 청크 크기 (기본값: 1MB = 1,048,576 bytes)
    headers?: Record<string, string>; // 인증 토큰 등 커스텀 헤더
};

export default RequestFileUploadPayload;

/** [요청] 파일 업로드 일시정지 페이로드 */
export type PauseFileUploadPayload = {
    uploadId: string;
};

/** [요청] 파일 업로드 재개 페이로드 */
export type ResumeFileUploadPayload = {
    uploadId: string;
};

/** [요청] 파일 업로드 취소 페이로드 */
export type CancelFileUploadPayload = {
    uploadId: string;
};

/**
 * [요청] 수동 복구 가능한 업로드 작업 목록 조회 페이로드
 */
export type ListRecoverableUploadsPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 업로드 작업 수동 복구(재개) 트리거 */
export type RecoverUploadPayload = {
    uploadId: string;
};

/** [요청] 업로드 작업 재시도 트리거 */
export type RetryUploadPayload = {
    uploadId: string;
};

/** [요청] 테스트용 dummy sparse 파일 생성 */
export type CreateDummyFilePayload = {
    sizeInBytes: number;
    fileName: string;
};

/** [응답] 테스트용 dummy sparse 파일 생성 결과 */
export type OnCreateDummyFilePayload = {
    uri: string; // 생성된 파일의 file:// URI
    name: string; // 파일명
    size: number; // 요청한 파일 크기 (bytes)
};

export type RecoverableUploadTaskStatus = 'uploading' | 'paused' | 'failed' | 'cancelled' | 'completed';

/**
 * [응답] 수동 복구 가능한 업로드 작업 정보
 */
export type RecoverableUploadTaskInfo = {
    uploadId: string;
    status: RecoverableUploadTaskStatus;
    payload: RequestFileUploadPayload;
    uploadedBytes: number;
    lastChunkIndex: number;
    retryCount: number;
    serverSession?: unknown;
    authRef?: string | null;
    createdAt: number;
    updatedAt: number;
};

/** [응답] 수동 복구 가능한 업로드 작업 목록 반환 */
export type OnListRecoverableUploadsPayload = {
    tasks: RecoverableUploadTaskInfo[];
};

/** [응답 - 이벤트] 파일 업로드 진행 상황 페이로드 */
export type OnUploadProgressPayload = {
    uploadId: string;
    progress: number; // 0 ~ 1 사이의 소수 (진행 비율)
    uploadedBytes: number; // 업로드 완료된 누적 바이트
    totalBytes: number; // 전체 파일 바이트 크기
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
};

/** [응답 - 이벤트] 파일 업로드 완료 페이로드 */
export type OnUploadCompletePayload = {
    uploadId: string;
    success: boolean;
    response?: string; // 업로드 성공 시 서버 응답 텍스트
    error?: {
        code: string;
        message: string;
    };
};

/** [요청] 주소록 조회 요청 페이로드 */
export type GetContactsPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 안전 영역 조회 요청 페이로드 */
export type FetchSafeAreaPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 백그라운드 상태 조회 요청 페이로드 */
export type FetchBackgroundStatusPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 앱 아이콘 정보 조회 요청 페이로드 */
export type FetchAppIconPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 앱 아이콘 목록 조회 요청 페이로드 */
export type FetchAppIconListPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};
