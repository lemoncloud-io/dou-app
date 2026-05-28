import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

/**
 * INotificationService
 *
 * 최하위 레벨에서 OS(FCM/APNs)와 밀접하게 연동하여 푸시 수신, 권한 관리, 뱃지 제어를 수행하는 네이티브 알림 서비스입니다.
 */
export interface INotificationService {
    /**
     * 알림 수신 권한 상태를 조회합니다.
     * @returns 권한 부여 여부에 대한 Firebase messaging AuthorizationStatus
     */
    hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus>;

    /**
     * 안드로이드 알림 채널(Channel)을 동적으로 생성 및 다국어 이름으로 갱신합니다.
     * 기기 OS 설정 창에 다국어가 즉시 반영되도록 구현되어 있습니다.
     */
    createNotificationChannel(): Promise<void>;

    /**
     * 시스템 알림 권한을 요청합니다.
     * @returns 권한 획득 성공 여부
     */
    requestPermission(): Promise<boolean>;

    /**
     * iOS 전용 APNs 토큰을 가져옵니다.
     * @returns APNs 토큰 문자열 또는 null
     */
    getAPNSToken(): Promise<string | null>;

    /**
     * 기기의 FCM 등록 토큰을 획득합니다.
     * @returns FCM 디바이스 토큰 문자열 또는 null
     */
    getToken(): Promise<string | null>;

    /**
     * 현재 기기의 FCM 등록 토큰을 강제로 만료 및 삭제합니다.
     */
    deleteToken(): Promise<void>;

    /**
     * iOS 환경에서 백그라운드 메시지 수신을 위해 APNs 등록 절차를 수행합니다.
     */
    registerAPNs(): Promise<void>;

    /**
     * 앱이 알림 클릭을 통해 처음 실행되었을 때(Cold Start) 유입된 초기 알림 페이로드를 가져옵니다.
     * @returns 초기 실행 원인이 된 RemoteMessage 페이로드 또는 null
     */
    getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null>;

    /**
     * 앱이 포그라운드(실행 중) 상태일 때 실시간으로 들어오는 알림 이벤트를 감지하기 위한 리스너를 등록합니다.
     * @param callback 알림 수신 시 호출될 핸들러
     * @returns 리스너 해제를 위한 언서브스크라이브 함수
     */
    onMessage(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * 백그라운드 상태에서 유저가 시스템 알림 배너를 클릭하여 앱이 활성화되었을 때의 리스너를 등록합니다.
     * @param callback 알림 클릭 시 호출될 핸들러
     * @returns 리스너 해제를 위한 언서브스크라이브 함수
     */
    onNotificationOpenedApp(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * FCM 토큰이 백그라운드에서 자동 갱신되었을 때 호출될 이벤트를 감지합니다.
     * @param callback 갱신된 토큰 문자열을 받는 핸들러
     * @returns 리스너 해제를 위한 언서브스크라이브 함수
     */
    onTokenRefresh(callback: (token: string) => void): () => void;

    /**
     * 앱 아이콘의 네이티브 뱃지 카운트 값을 설정합니다.
     * @param count 뱃지에 지정할 숫자
     */
    setBadgeCount(count: number): Promise<void>;

    /**
     * 앱 아이콘의 네이티브 뱃지 카운트 값을 0으로 즉시 초기화합니다.
     */
    clearBadge(): Promise<void>;

    /**
     * 현재 앱 아이콘에 적용되어 있는 네이티브 뱃지 카운트를 조회합니다.
     * @returns 현재 뱃지 카운트 숫자
     */
    getBadgeCount(): Promise<number>;
}

/**
 * IOfflinePushQueue
 *
 * 헤드리스 JS 스레드나 SQLite가 사용 불가능한 상태에서 유입된 실시간 알림 페이로드를
 * 유실 방지를 위해 임시 디바이스 스토리지(MMKV)에 큐 형태로 캐싱하는 서비스입니다.
 */
export interface IOfflinePushQueue {
    /**
     * 알림 데이터 페이로드를 캐시 큐에 임시 적재합니다. (중복 방지 데듀플리케이션 처리 포함)
     * @param payload 캐싱할 알림 데이터 딕셔너리
     */
    enqueue(payload: Record<string, string | object>): Promise<void>;

    /**
     * 임시 적재된 오프라인 알림 데이터를 모두 읽어 로컬 SQLite 데이터베이스에 벌크 반영(Upsert)하고 큐를 비웁니다.
     */
    flush(): Promise<void>;
}

/**
 * IPushEventManager
 *
 * 최하단 네이티브 알림 채널과 하이브리드 웹뷰 브릿지(`useFcmHandler`) 간의 결합도를 낮추고
 * 포그라운드 푸시 이벤트를 다중 옵저버로 안전하게 전파하기 위한 이벤트 브로커입니다.
 */
export interface IPushEventManager {
    /**
     * 포그라운드에서 실시간 푸시 수신 시 전파받을 리스너를 추가합니다.
     * @param callback 알림 메시지를 처리할 콜백
     * @returns 리스너 해제(Unsubscribe) 함수
     */
    onReceiveNotification(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void;

    /**
     * 감지된 포그라운드 푸시 메시지를 등록된 모든 브릿지 리스너에게 멀티캐스팅 전파합니다.
     * @param message 전파할 원본 RemoteMessage
     */
    emitReceiveNotification(message: FirebaseMessagingTypes.RemoteMessage): void;
}

/**
 * IDeeplinkRoutingService
 *
 * 알림 배너 클릭 이벤트를 단일 수집하여, 원시 푸시 페이로드를 적절한 앱 내 웹뷰 URL 스키마로 가공한 뒤
 * 네이티브 DeepLinkManager를 통해 화면을 통일성 있게 이동시키는 고수준 라우팅 매핑 서비스입니다.
 */
export interface IDeeplinkRoutingService {
    /**
     * 알림 클릭 이벤트 수신 시 화면 전환 처리를 수행합니다.
     * @param data 알림 클릭 페이로드 데이터 딕셔너리
     */
    handleNotificationClick(data: Record<string, string | object> | undefined): Promise<void>;
}
