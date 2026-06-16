import { PermissionsAndroid, Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging, { AuthorizationStatus } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import type { INotificationService } from './types';
import type { ILogService } from '../log';
import { t } from '../../utils';

/**
 * NotificationService
 *
 * 안드로이드(FCM/Notifee)와 iOS(FCM/APNs/PushNotificationIOS)의 네이티브 푸시 채널 및 권한,
 * 앱 배지(Badge Count) 데이터베이스를 정밀 제어하는 핵심 네이티브 통신 모듈입니다.
 */
export class NotificationService implements INotificationService {
    constructor(private readonly logger: ILogService) {}

    /**
     * 알림 수신 권한 상태를 조회합니다.
     * @returns 권한 상태
     */
    async hasPermission(): Promise<FirebaseMessagingTypes.AuthorizationStatus> {
        return messaging().hasPermission();
    }

    /**
     * 안드로이드 OS 설정 화면에 연동될 알림 채널(Notification Channel)을 생성하고 기기 설정 언어에 맞게 동적 번역 갱신합니다.
     * - `dou_chat`: 새 채팅 메시지 (높은 중요도, 소리 활성화)
     * - `dou_chat_muted`: 무음 채팅 메시지 (낮은 중요도, 무음)
     * - `dou_notice`: 서비스 공지사항 (기본 중요도)
     * - `dou_marketing`: 혜택 및 이벤트 (낮은 중요도)
     * - `dou_cloud`: 클라우드 파일 동기화 (높은 중요도)
     */
    async createNotificationChannel() {
        await notifee.createChannel({
            id: 'dou_chat',
            name: t('notification.channel.chat'),
            importance: AndroidImportance.HIGH,
            sound: 'default',
        });
        await notifee.createChannel({
            id: 'dou_chat_muted',
            name: t('notification.channel.chat'),
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_notice',
            name: t('notification.channel.notice'),
            importance: AndroidImportance.DEFAULT,
        });

        await notifee.createChannel({
            id: 'dou_marketing',
            name: t('notification.channel.marketing'),
            importance: AndroidImportance.LOW,
        });

        await notifee.createChannel({
            id: 'dou_cloud',
            name: t('notification.channel.cloud'),
            importance: AndroidImportance.HIGH,
        });
    }

    /**
     * 플랫폼별 안드로이드 13+(API 33+) 알림 권한 및 iOS 푸시 권한을 일관되게 요청합니다.
     * @returns 권한 획득 성공 여부
     */
    async requestPermission(): Promise<boolean> {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                return false;
            }
        }

        const authStatus = await messaging().requestPermission();
        return authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
    }

    /**
     * iOS 전용 APNs 토큰을 조회합니다. (FCM 연동에 필수)
     * @returns APNs 토큰 또는 null
     */
    async getAPNSToken(): Promise<string | null> {
        if (Platform.OS === 'ios') {
            return await messaging().getAPNSToken();
        }
        return null;
    }

    /**
     * 기기 고유의 FCM 등록 토큰을 획득합니다.
     * @returns FCM 등록 토큰 또는 null
     */
    async getToken(): Promise<string | null> {
        try {
            return await messaging().getToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get token error.', e);
            return null;
        }
    }

    /**
     * 현재 기기의 FCM 토큰을 만료 및 해제 처리합니다. (로그아웃 시 권장)
     */
    async deleteToken(): Promise<void> {
        try {
            await messaging().deleteToken();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Delete token error.', e);
        }
    }

    /**
     * iOS 환경에서 백그라운드 푸시 감지를 위한 APNs 백그라운드 핸들러를 가동 등록합니다.
     */
    async registerAPNs(): Promise<void> {
        try {
            await messaging().registerDeviceForRemoteMessages();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Register APNs error.', e);
        }
    }

    /**
     * 앱이 완전히 종료(Killed)된 상태에서 시스템 알림 배너를 클릭하여 첫 구동을 발생시킨 페이로드를 가로채 정규화합니다.
     * 진입 시 아이콘 뱃지는 자동으로 클리어됩니다.
     * @returns 정규화된 RemoteMessage 또는 null
     */
    async getInitialNotification(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
        this.clearBadge();

        if (Platform.OS === 'ios') {
            const apnsInitial = await PushNotificationIOS.getInitialNotification();
            if (apnsInitial) {
                // APNs 알림 객체를 표준 FCM RemoteMessage 구조로 정규화 매핑
                return {
                    notification: {
                        title: apnsInitial.getTitle(),
                        body: apnsInitial.getMessage(),
                    },
                    data: apnsInitial.getData() as Record<string, string>,
                    sentTime: Date.now(),
                } as FirebaseMessagingTypes.RemoteMessage;
            }
        }

        return messaging().getInitialNotification();
    }

    /**
     * 앱 포그라운드 상태에서 실시간 유입되는 알림 이벤트를 OS로부터 바인딩하여 관찰자 핸들러로 전달합니다.
     * iOS APNs 감지와 안드로이드 FCM 감지를 단일 진입 콜백으로 표준 포맷팅(Normalize)해 줍니다.
     * @param callback 알림 수신 시 구동될 콜백 함수
     * @returns 콜백 바인딩을 끊기 위한 해제 함수
     */
    onMessage(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();

        // 1. Android FCM 수신 리스너 등록
        const unsubscribeFCM = messaging().onMessage(callback);

        // 2. iOS APNs 수신 리스너 등록 및 표준화
        if (Platform.OS === 'ios') {
            const handleAPNs = (notification: any) => {
                const normalizedMessage = {
                    notification: {
                        title: notification.getTitle(),
                        body: notification.getMessage(),
                    },
                    data: notification.getData() as Record<string, string>,
                    sentTime: Date.now(),
                } as FirebaseMessagingTypes.RemoteMessage;

                callback(normalizedMessage);

                // iOS 백그라운드 데이터 수신 완료 보고 필수
                notification.finish(PushNotificationIOS.FetchResult.NoData);
            };

            PushNotificationIOS.addEventListener('notification', handleAPNs);

            return () => {
                unsubscribeFCM();
                PushNotificationIOS.removeEventListener('notification');
            };
        }

        return unsubscribeFCM;
    }

    /**
     * 백그라운드 활성화 상태에서 유저가 배너 알림을 클릭해 진입했을 때의 콜백 등록기입니다.
     * @param callback 클릭 발생 핸들러 콜백
     * @returns 리스너 해제 함수
     */
    onNotificationOpenedApp(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.clearBadge();
        return messaging().onNotificationOpenedApp(callback);
    }

    /**
     * FCM 토큰이 네트워크 상태 등에 의해 임의로 백그라운드 갱신되었을 때 등록될 콜백 함수입니다.
     * @param callback 갱신된 토큰 수신 콜백
     * @returns 리스너 해제 함수
     */
    onTokenRefresh(callback: (token: string) => void): () => void {
        return messaging().onTokenRefresh(callback);
    }

    /**
     * 홈 화면의 앱 런처 아이콘 위에 특정 뱃지 카운트 숫자를 그립니다. (Notifee 활용)
     * @param count 표시할 숫자
     */
    async setBadgeCount(count: number): Promise<void> {
        try {
            await notifee.setBadgeCount(count);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Set badge error.', e);
        }
    }

    /**
     * 홈 화면의 앱 런처 아이콘 뱃지를 즉시 제거(0으로 설정)합니다.
     */
    async clearBadge(): Promise<void> {
        try {
            await notifee.setBadgeCount(0);
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Clear badge error.', e);
        }
    }

    /**
     * 현재 앱 아이콘에 떠 있는 네이티브 뱃지 카운트 값을 조회합니다.
     * @returns 현재 뱃지 숫자
     */
    async getBadgeCount(): Promise<number> {
        try {
            return await notifee.getBadgeCount();
        } catch (e) {
            this.logger.error('NOTIFICATION', 'Get badge error.', e);
            return 0;
        }
    }
}
