import type { ShareAction } from 'react-native';

/**
 * 디바이스 미디어 자산 (사진, 동영상) 상세 정보
 */
export interface MediaAsset {
    /** 로컬 파일 시스템 URI */
    uri?: string;
    /** 원본 파일명 */
    fileName?: string;
    /** 파일 MIME 타입 (예: image/jpeg) */
    type?: string;
    /** 미디어 가로 픽셀 크기 */
    width?: number;
    /** 미디어 세로 픽셀 크기 */
    height?: number;
    /** 파일 크기 (bytes) */
    fileSize?: number;
    /** Base64 인코딩된 파일 데이터 (옵션에 따라 포함됨) */
    base64?: string;
}

/** * 디바이스 문서 파일 정보
 */
export interface DocumentInfo {
    /** 로컬 파일 시스템 URI */
    uri: string;
    /** 문서 파일명 */
    name?: string | null;
    /** 파일 MIME 타입 */
    type?: string | null;
    /** 파일 크기 (bytes) */
    size?: number | null;
    /** Base64 인코딩된 파일 데이터 */
    base64?: string;
}

/** * 기기 주소록 연락처 상세 정보
 */
export interface ContactInfo {
    /** 디바이스 내 연락처 고유 식별자 */
    recordID: string;
    backTitle: string;
    /** 직장명 / 회사명 */
    company: string | null;
    /** 등록된 이메일 주소 목록 */
    emailAddresses: EmailAddress[];
    /** 전체 표시 이름 */
    displayName: string;
    /** 성 (Last name) */
    familyName: string;
    /** 이름 (First name) */
    givenName: string;
    /** 중간 이름 (Middle name) */
    middleName: string;
    /** 직함 / 직위 */
    jobTitle: string;
    /** 등록된 전화번호 목록 */
    phoneNumbers: PhoneNumber[];
    /** 연락처 프로필 사진 존재 여부 */
    hasThumbnail: boolean;
    /** 연락처 프로필 사진 로컬 경로 */
    thumbnailPath: string;
    /** 즐겨찾기 등록 여부 */
    isStarred: boolean;
    /** 등록된 물리적 주소 목록 */
    postalAddresses: PostalAddress[];
    /** 이름 접두사 (예: Mr., Dr.) */
    prefix: string;
    /** 이름 접미사 (예: Jr., Sr.) */
    suffix: string;
    /** 소속 부서 */
    department: string;
    /** 생년월일 정보 */
    birthday?: Birthday;
    /** 메신저 계정 주소 목록 */
    imAddresses: InstantMessageAddress[];
    /** 웹사이트 URL 목록 */
    urlAddresses: UrlAddress[];
    /** 연락처 메모 */
    note: string;
}

/** 이메일 주소 정보 (예: label: 'work', email: 'dev@example.com') */
export interface EmailAddress {
    label: string;
    email: string;
}

/** 전화번호 정보 (예: label: 'mobile', number: '010-0000-0000') */
export interface PhoneNumber {
    label: string;
    number: string;
}

/** 물리적 주소(우편 주소) 정보 */
export interface PostalAddress {
    /** 주소 라벨 (예: 'home', 'work') */
    label: string;
    /** 전체 주소 문자열 */
    formattedAddress: string;
    /** 거리명 / 도로명 */
    street: string;
    /** 사서함 번호 */
    pobox: string;
    /** 동 / 이웃 지역명 */
    neighborhood: string;
    /** 시 / 군 / 구 */
    city: string;
    /** 광역 지자체 / 도 */
    region: string;
    /** 주 (State) */
    state: string;
    /** 우편번호 */
    postCode: string;
    /** 국가명 */
    country: string;
}

/** 생년월일 정보 */
export interface Birthday {
    day: number;
    month: number;
    year: number;
}

/** 인스턴트 메신저 계정 정보 */
export interface InstantMessageAddress {
    username: string;
    service: string;
}

/** URL 주소 정보 */
export interface UrlAddress {
    label: string;
    url: string;
}

/** 네이티브 앱 권한 유형 */
export type AppPermissionType = 'CONTACTS' | 'NOTIFICATIONS' | 'CAMERA' | 'PHOTO_LIBRARY';

/** * 네이티브 앱 권한 승인 상태
 * - GRANTED: 사용자가 권한을 허용함
 * - DENIED: 사용자가 권한을 거부함 (다시 요청 가능)
 * - BLOCKED: 사용자가 권한을 완전히 차단함 (OS 설정에서 직접 변경해야 함)
 * - UNAVAILABLE: 디바이스 하드웨어 제약으로 해당 기능 사용 불가
 */
export type PermissionStatus = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';

/**
 * 앱 백그라운드/포그라운드 상태
 * - active: 앱이 포그라운드에서 실행 중이며 사용자와 상호작용 가능
 * - background: 앱이 백그라운드에 숨겨진 상태
 * - inactive: (iOS 전용) 전화가 오거나 시스템 알림창을 내리는 등 전환 중인 유휴 상태
 */
export type AppBackgroundStatus = 'active' | 'background' | 'inactive';

/** [요청] OS 기본 공유 시트 열기 */
export interface OpenShareSheetPayload {
    /** 공유할 콘텐츠의 제목 */
    title?: string;
    /** 공유할 메시지 본문 텍스트 */
    message?: string;
    /** 공유할 웹사이트 또는 파일 URL */
    url?: string;
    /** 공유 대상의 MIME 타입 */
    type?: string;
    /** 이메일 공유 시 사용될 제목 */
    subject?: string;
}

/** [요청] 문서(파일) 선택기 열기 */
export interface OpenDocumentPayload {
    /** 다중 파일 선택 허용 여부 */
    allowMultiSelection?: boolean;
    /** 선택을 허용할 MIME 타입 배열 (예: ['application/pdf']) */
    type?: string[];
    /** 파일 데이터를 Base64로 인코딩하여 반환할지 여부 */
    includeBase64?: boolean;
}

/** [요청] 네이티브 카메라 실행 */
export interface OpenCameraPayload {
    /** 촬영할 미디어 유형 */
    mediaType?: 'photo' | 'video' | 'mixed';
    /** 이미지 압축 품질 (0.0 최하 ~ 1.0 원본) */
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    /** 리사이징할 최대 가로 픽셀 */
    maxWidth?: number;
    /** 리사이징할 최대 세로 픽셀 */
    maxHeight?: number;
    /** Base64 데이터 포함 여부 */
    includeBase64?: boolean;
    /** 초기 실행할 카메라 렌즈 방향 (전면/후면) */
    cameraType?: 'back' | 'front';
}

/** [요청] 네이티브 사진/동영상 갤러리 열기 */
export interface OpenPhotoLibraryPayload {
    /** 최대 선택 가능한 미디어 개수 (0은 무제한) */
    selectionLimit?: number;
    /** 선택 가능한 미디어 유형 */
    mediaType?: 'photo' | 'video' | 'mixed';
    /** 선택된 미디어의 리사이징 최대 가로 픽셀 */
    maxWidth?: number;
    /** 선택된 미디어의 리사이징 최대 세로 픽셀 */
    maxHeight?: number;
    /** 이미지 압축 품질 (0.0 최하 ~ 1.0 원본) */
    quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
    /** Base64 데이터 포함 여부 */
    includeBase64?: boolean;
}

/** [요청] 디바이스의 기본 브라우저나 외부 앱으로 URL 열기 */
export interface OpenURLPayload {
    /** 실행할 외부 URL (http, mailto, tel 등) */
    url: string;
}

/** [요청] OS 시스템 권한 요청 다이얼로그 띄우기 */
export interface RequestPermissionPayload {
    /** 요청할 대상 권한 */
    permission: AppPermissionType;
}

/** [요청] 네이티브의 뒤로가기(스와이프/물리버튼) 가능 여부 설정 */
export interface SetCanGoBackPayload {
    /** true 설정 시 웹뷰 내부 라우팅을 우선 처리 */
    canGoBack: boolean;
}

/** [요청] 웹뷰 내 스크롤 이벤트 발생 시 네이티브에 알림 */
export interface ScrollDataPayload {
    /** 현재 스크롤이 발생한 웹 페이지 URL */
    url: string;
    /** 스크롤 진행도를 나타내는 백분율 (0 ~ 100) */
    scrollPercentage: number;
}

/** [요청] 네이티브 바텀시트/모달로 특정 URL의 웹뷰 열기 */
export interface OpenModalPayload {
    /** 모달로 띄울 웹 페이지 주소 */
    url: string;
    /** * 화면을 덮는 비율 및 형태
     * - full: 전체 화면을 덮는 모달
     * - sheet: 화면 하단에서 올라오는 바텀 시트
     */
    type?: 'full' | 'sheet';
    /** 바텀 시트가 펼쳐지는 높이 비율 (기본값 0.9, type이 full이면 1로 무시됨) */
    heightRatio?: number;
    /** 바텀 시트 상단에 드래그하여 닫을 수 있는 핸들 바 표시 여부 */
    dragHandle?: boolean;
}

/**
 * ----------------------------------------------------------------------
 * 3. 통신 페이로드 (App -> Web 응답)
 * ----------------------------------------------------------------------
 */

/** [응답] 공유 액션 완료 결과 */
export interface OnOpenShareSheetPayload extends ShareAction {}

/** [응답] 문서 선택기에서 선택된 파일 목록 */
export interface OnOpenDocumentPayload {
    documents: DocumentInfo[];
}

/** [응답] 주소록 권한 획득 후 디바이스 전체 연락처 목록 반환 */
export interface OnGetContactsPayload {
    contacts: ContactInfo[];
}

/** [응답] 카메라 촬영 결과물 반환 */
export interface OnOpenCameraPayload {
    assets: MediaAsset[];
}

/** [응답] 사진 갤러리에서 선택된 결과물 반환 */
export interface OnOpenPhotoLibraryPayload {
    assets: MediaAsset[];
}

/** [응답] 시스템 권한 요청 결과 반환 */
export interface OnRequestPermissionPayload {
    /** 요청했던 대상 권한 */
    permission: AppPermissionType;
    /** 최종 승인/거부 상태 */
    status: PermissionStatus;
}

/** [응답] 앱이 백그라운드로 가거나 포그라운드로 복귀했을 때 상태 알림 */
export interface OnBackgroundStatusChangedPayload {
    /** 현재 앱 상태 (active, background, inactive) */
    status: AppBackgroundStatus;
    /** 앱이 백그라운드에 숨겨져 있는지 여부 */
    isBackground: boolean;
    /** 앱이 현재 사용자와 포그라운드에서 상호작용 중인지 여부 */
    isForeground: boolean;
}
