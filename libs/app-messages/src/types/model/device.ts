import type { Platform } from './common';

export type PageLanguage = 'ko' | 'en' | 'cn' | 'jp' | 'vn' | 'id' | 'th';
export type Env = 'local' | 'stage' | 'prod';

/** 앱 및 웹 버전 정보 */
export interface VersionInfo {
    currentVersion: string; // 현재 통합 버전
    latestVersion: string; // 서버 최신 버전
    shouldUpdate: boolean; // 업데이트 강제 여부
    appVersion: string; // 네이티브 빌드 버전
    webVersion: string; // 번들링된 웹 버전
}

/** 디바이스 고유 정보 */
export interface DeviceInfo {
    stage: Env;
    platform: Platform;
    application: string; // 앱 패키지명/번들ID
    deviceToken?: string; // 푸시용 토큰 (FCM/APNS)
    deviceId?: string | null;
    deviceModel?: string | null;
    installId?: string | null;
    lang?: PageLanguage;
}

/** 디스플레이 안전 영역 (노치, 홈바 대응) */
export interface SafeAreaInfo {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/** [응답] 디바이스/버전 정보 업데이트 페이로드 */
export interface OnUpdateDeviceInfoPayload extends DeviceInfo, VersionInfo {}

/** [응답] 세이프 에어리어 정보 반환 페이로드 */
export interface OnFetchSafeAreaPayload extends SafeAreaInfo {}

// --- File Upload Interfaces ---

/** [요청] 파일 업로드 요청 페이로드 */
export interface RequestFileUploadPayload {
    uploadId: string; // 업로드 고유 식별자 (Web에서 UUID 생성하여 네이티브에 제어권 전달)
    fileUri: string; // 기기 내부 임시 파일 URI (DocumentPicker/ImagePicker 획득 주소)
    fileName: string; // 파일 이름
    fileSize: number; // 파일 전체 크기 (bytes)
    mimeType: string; // 파일 MIME 타입
    uploadUrl: string; // 업로드 대상 API 엔드포인트 URL
    chunkSize?: number; // 분할 전송 청크 크기 (기본값: 1MB = 1,048,576 bytes)
    headers?: Record<string, string>; // 인증 토큰 등 커스텀 헤더
}

export default RequestFileUploadPayload;

/** [요청] 파일 업로드 일시정지 페이로드 */
export interface PauseFileUploadPayload {
    uploadId: string;
}

/** [요청] 파일 업로드 재개 페이로드 */
export interface ResumeFileUploadPayload {
    uploadId: string;
}

/** [요청] 파일 업로드 취소 페이로드 */
export interface CancelFileUploadPayload {
    uploadId: string;
}

/**
 * [요청] 수동 복구 가능한 업로드 작업 목록 조회
 * - 앱 재시작/중단 이후 DB에 남아있는 작업을 WebView에서 조회하기 위한 메시지
 */
export type ListRecoverableUploadsPayload = never;

/** [요청] 업로드 작업 수동 복구(재개) 트리거 */
export interface RecoverUploadPayload {
    uploadId: string;
}

/** [요청] 업로드 작업 재시도 트리거 */
export interface RetryUploadPayload {
    uploadId: string;
}

/** [요청] 테스트용 dummy sparse 파일 생성 */
export interface CreateDummyFilePayload {
    sizeInBytes: number;
    fileName: string;
}

export type RecoverableUploadTaskStatus = 'uploading' | 'paused' | 'failed' | 'cancelled' | 'completed';

/**
 * [응답] 수동 복구 가능한 업로드 작업 정보
 * - payload는 RequestFileUploadPayload 형태로 유지하여, WebView가 동일 uploadId로 재개 요청을 만들 수 있게 한다.
 */
export interface RecoverableUploadTaskInfo {
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
}

/** [응답] 수동 복구 가능한 업로드 작업 목록 반환 */
export interface OnListRecoverableUploadsPayload {
    tasks: RecoverableUploadTaskInfo[];
}

/** [응답 - 이벤트] 파일 업로드 진행 상황 페이로드 */
export interface OnUploadProgressPayload {
    uploadId: string;
    progress: number; // 0 ~ 1 사이의 소수 (진행 비율)
    uploadedBytes: number; // 업로드 완료된 누적 바이트
    totalBytes: number; // 전체 파일 바이트 크기
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
}

/** [응답 - 이벤트] 파일 업로드 완료 페이로드 */
export interface OnUploadCompletePayload {
    uploadId: string;
    success: boolean;
    response?: string; // 업로드 성공 시 서버 응답 텍스트
    error?: {
        code: string;
        message: string;
    };
}
